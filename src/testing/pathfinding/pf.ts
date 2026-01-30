// Reimplementation of pathfinding
// From https://github.com/screeps/driver/blob/master/native/src/pf.cc

import { PfCostMatrix } from "./cost_matrix";
import { PriorityQueue } from "./priority_queue";
import { MapPosition } from "./map_position";
import { OpenClosedSet } from "./open_closed_set";
import { RoomInfo } from "./room_info";
import { AllDirections, RoomPositionLike, TerrainData, TerrainPackedBits } from "./types";
import { WorldPosition, WorldPositionId } from "./world_position";

type Cost = number;
type PositionIndex = number;
type RoomIndex = number;

type MapPositionToCostMatrixCallback = (mapPos: MapPosition) => PfCostMatrix | false | undefined;

type PathFinderGoal = { pos: WorldPosition, range: number };

export type SearchResponse = ModPfSearchResponse | -1 | undefined;

type ModPfSearchResponse = {
    path: WorldPosition[];
    ops: number;
    cost: number;
    incomplete: boolean;
}

const OBSTACLE: Cost = Number.MAX_SAFE_INTEGER;

export class RoomCallbackError extends Error { }

export class MockPathFinder {
    private lookTable: Cost[] = [OBSTACLE, OBSTACLE, OBSTACLE, OBSTACLE];
    private terrainByMapPosId = new Map<number, number[][]>();
    private childToParentMapping = new Map<WorldPositionId, WorldPositionId>();
    private roomInfoByMapPositionId = new Map<number, RoomInfo>();

    private blockedRoomSet = new Set<number>();
    private maxRooms: number = -1;
    private heuristicWeight: number = 1.2;
    private callback: null | MapPositionToCostMatrixCallback = null;

    private goals: PathFinderGoal[] = [];
    private heap = new PriorityQueue<WorldPositionId>;
    private openClosedSet: OpenClosedSet = new OpenClosedSet();
    private flee: boolean = false;

    constructor() { }

    public loadTerrain(terrainData: TerrainData[]): void {
        for (let i = 0; i < terrainData.length; i++) {
            const nextData = terrainData[i];
            const mapPos = nextData.room;
            this.terrainByMapPosId.set(mapPos.getId(), nextData.vals);
        }
    }

    public search(
        origin: WorldPosition,
        goals: PathFinderGoal[],
        callback: MapPositionToCostMatrixCallback | null,
        plainCost: number,
        swampCost: number,
        maxRooms: number,
        maxOps: number,
        maxCost: number,
        flee: boolean,
        heuristicWeight: number): SearchResponse {

        // Clean up from previous iterations
        this.blockedRoomSet.clear();
        this.openClosedSet.clear();
        this.heap.clear();

        this.childToParentMapping.clear();

        this.roomInfoByMapPositionId.clear();

        //Construct goal objects
        this.goals = [...goals];

        // GC stuff
        this.callback = callback;

        // Other initialization
        this.lookTable[0] = plainCost;
        this.lookTable[2] = swampCost;
        this.maxRooms = maxRooms;
        this.heuristicWeight = heuristicWeight;
        this.flee = flee;

        let opsRemaining = maxOps;

        let minNodeHeuristicCost: Cost = Number.MAX_SAFE_INTEGER;
        let minNodeGCost: Cost = Number.MAX_SAFE_INTEGER;
        let minNode: WorldPositionId = 0;

        // Special case for searching to same node, otherwise it searches everywhere because origin node
        // is closed
        if (this.heuristic(origin) == 0) {
            return undefined;
        }

        try {
            // Prime data for roomInfoFromMapPosition()
            if (this.roomInfoFromMapPosition(origin.getMapPosition()) === null) {
                // Initial room is inaccessible
                return -1;
            }

            // Initial A* iteration
            minNode = origin.getId();
            this.astar(minNode, origin, 0);

            // Loop until we have a solution
            while (!this.heap.isEmpty() && opsRemaining > 0) {

                // Pull cheapest open node off the heap and close the node
                const { index: nextIndex, priority: nextPriority } = this.heap.pop()!;
                this.openClosedSet.close(nextIndex);

                // Calculate costs
                const worldPos: WorldPosition = WorldPosition.fromId(nextIndex);
                const heuristicCost = this.heuristic(worldPos);
                const gCost = nextPriority - ((heuristicCost * this.heuristicWeight) | 0);

                // Reached destination?
                if (heuristicCost === 0) {
                    minNode = nextIndex;
                    minNodeHeuristicCost = 0;
                    minNodeGCost = gCost;
                    break;
                } else if (heuristicCost < minNodeHeuristicCost) {
                    minNode = nextIndex;
                    minNodeHeuristicCost = heuristicCost;
                    minNodeGCost = gCost;
                }

                if (gCost + heuristicCost > maxCost) {
                    break;
                }

                // Add next neighbors to heap
                this.jps(nextIndex, worldPos, gCost);
                opsRemaining -= 1;
            }
        } catch (e) {
            return undefined;
        }

        // Reconstruct path from A* graph
        let lastPos: WorldPosition = WorldPosition.fromId(minNode);

        const pathArr: WorldPosition[] = [];
        while (lastPos.getId() !== origin.getId()) {
            pathArr.push(new WorldPosition(lastPos.xx, lastPos.yy));
            const nextId = this.childToParentMapping.get(lastPos.getId());
            if (nextId === undefined) {
                throw new Error(`Unable to unwrap path; no parent found for ${lastPos}`);
            }
            const nextPos: WorldPosition = WorldPosition.fromId(nextId);
            if (nextPos.getRangeTo(lastPos) > 1) {
                const dir = lastPos.getDirectionTo(nextPos);
                do {
                    lastPos = lastPos.worldPositionInDirection(dir);
                    pathArr.push(new WorldPosition(lastPos.xx, lastPos.yy));
                } while (lastPos.getRangeTo(nextPos) > 1);
            }
            lastPos = nextPos;
        }

        return {
            path: pathArr,
            ops: maxOps - opsRemaining,
            cost: minNodeGCost,
            incomplete: minNodeHeuristicCost !== 0,
        };
    }

    /** Returns the room info for a given MapPosition.
     * 
     * Will construct and cache a new RoomInfo if none exists for the Room
     * associated with this MapPosition.
     * 
     * @returns the cached or created RoomInfo, or null
     */
    private roomInfoFromMapPosition(mapPos: MapPosition): RoomInfo | null {
        const mapId = mapPos.getId();
        if (this.roomInfoByMapPositionId.has(mapId)) {
            return this.roomInfoByMapPositionId.get(mapId)!;
        }

        if (this.roomInfoByMapPositionId.size >= this.maxRooms) {
            return null;
        }
        if (this.blockedRoomSet.has(mapId)) {
            return null;
        }

        const terrainData = this.terrainByMapPosId.get(mapId);
        if (terrainData === undefined) {
            throw new Error('Could not load terrain data');
        }

        let costMatrix: PfCostMatrix | null = null;
        if (this.callback !== null) {
            const callbackRet = this.callback(mapPos);
            if (typeof (callbackRet) === 'boolean' && callbackRet === false) {
                this.blockedRoomSet.add(mapId);
                return null;
            }
            if (callbackRet === undefined) {
                costMatrix = null;
            } else {
                costMatrix = callbackRet;
            }
        }

        const newRoomInfo = new RoomInfo(terrainData, costMatrix, mapPos);
        this.roomInfoByMapPositionId.set(mapId, newRoomInfo);

        return newRoomInfo;
    }

    /**
     * Returns the cost of the world position.
     * 
     * @returns The cost matrix value of the coordinate of the WorldPosition,
     *   or the default terrain cost if no Cost Matrix value is present.
     */
    private look(worldPos: WorldPosition): Cost {
        const roomInfo = this.roomInfoFromMapPosition(worldPos.getMapPosition());
        if (roomInfo === null) {
            return OBSTACLE;
        }

        if (roomInfo.costMatrix !== null) {
            const tmp = roomInfo.costMatrix.get(worldPos.xx % 50, worldPos.yy % 50);
            if (tmp !== undefined && tmp !== 0) {
                if (tmp >= 0xff) {
                    return OBSTACLE;
                } else {
                    return tmp;
                }
            }
        }

        return this.lookTable[roomInfo.look(worldPos.xx % 50, worldPos.yy % 50)];
    }

    private astar(index: PositionIndex, worldPos: WorldPosition, gCost: Cost): void {
        for (const dir of AllDirections) {
            const neighbor: WorldPosition = worldPos.worldPositionInDirection(dir);

            // If this is a portal node there are moves which are impossible
            // and should be discarded
            if (worldPos.xx % 50 === 0) {
                if (neighbor.xx % 50 === 49 && worldPos.yy !== neighbor.yy) {
                    continue;
                } else if (worldPos.xx === neighbor.xx) {
                    continue;
                }
            } else if (worldPos.xx % 50 === 49) {
                if (neighbor.xx % 50 === 0 && worldPos.yy !== neighbor.yy) {
                    continue;
                } else if (worldPos.xx === neighbor.xx) {
                    continue;
                }
            } else if (worldPos.yy % 50 === 0) {
                if (neighbor.yy % 50 === 49 && worldPos.xx !== neighbor.xx) {
                    continue;
                } else if (worldPos.yy === neighbor.yy) {
                    continue;
                }
            } else if (worldPos.yy % 50 === 49) {
                if (neighbor.yy % 50 === 0 && worldPos.xx !== neighbor.xx) {
                    continue;
                } else if (worldPos.yy === neighbor.yy) {
                    continue;
                }
            }

            // Calculate the cost of this move
            const nCost: Cost = this.look(neighbor);
            if (nCost === OBSTACLE) {
                continue;
            }

            this.pushNode(index, neighbor, gCost + nCost);
        }
    }

    /** Pushes a new node to the heap, or updates its cost if it already exists. */
    private pushNode(parentId: WorldPositionId, node: WorldPosition, gCost: Cost): void {
        const nodeId = node.getId();

        if (this.openClosedSet.isClosed(nodeId)) {
            return;
        }

        const heuristicCost = (this.heuristic(node) * this.heuristicWeight) | 0;
        const fCost = heuristicCost + gCost;

        if (this.openClosedSet.isOpen(nodeId)) {
            if (this.heap.getPriority(nodeId)! > fCost) {
                this.heap.update(nodeId, fCost);
                this.childToParentMapping.set(nodeId, parentId);
            }
        } else {
            this.heap.insert(nodeId, fCost);
            this.openClosedSet.open(nodeId);
            this.childToParentMapping.set(nodeId, parentId);
        }
    }

    private jumpX(cost: Cost, worldPos: WorldPosition, dx: number): WorldPosition | null {
        let prevCostU: Cost = this.look(new WorldPosition(worldPos.xx, worldPos.yy - 1));
        let prevCostD: Cost = this.look(new WorldPosition(worldPos.xx, worldPos.yy + 1));
        while (true) {
            if (this.heuristic(worldPos) === 0 || isNearBorderPos(worldPos.xx)) {
                break;
            }

            const costU = this.look(new WorldPosition(worldPos.xx + dx, worldPos.yy - 1));
            const costD = this.look(new WorldPosition(worldPos.xx + dx, worldPos.yy + 1));
            if (
                (costU !== OBSTACLE && prevCostU !== cost) ||
                (costD !== OBSTACLE && prevCostD !== cost)
            ) {
                break;
            }
            prevCostU = costU;
            prevCostD = costD;
            worldPos.xx += dx;

            const jumpCost: Cost = this.look(worldPos);
            if (jumpCost === OBSTACLE) {
                return null;
            } else if (jumpCost !== cost) {
                break;
            }
        }
        return worldPos;
    }

    private jumpY(cost: Cost, worldPos: WorldPosition, dy: number): WorldPosition | null {
        let prevCostL: Cost = this.look(new WorldPosition(worldPos.xx - 1, worldPos.yy));
        let prevCostR: Cost = this.look(new WorldPosition(worldPos.xx + 1, worldPos.yy));
        while (true) {
            if (this.heuristic(worldPos) === 0 || isNearBorderPos(worldPos.yy)) {
                break;
            }

            const costL = this.look(new WorldPosition(worldPos.xx - 1, worldPos.yy + dy));
            const costR = this.look(new WorldPosition(worldPos.xx + 1, worldPos.yy + dy));
            if (
                (costL !== OBSTACLE && prevCostL !== cost) ||
                (costR !== OBSTACLE && prevCostR !== cost)
            ) {
                break;
            }
            prevCostL = costL;
            prevCostR = costR;
            worldPos.yy += dy;

            const jumpCost: Cost = this.look(worldPos);
            if (jumpCost === OBSTACLE) {
                return null;
            } else if (jumpCost !== cost) {
                break;
            }
        }
        return worldPos;
    }

    private jumpXY(cost: Cost, worldPos: WorldPosition, dx: number, dy: number): WorldPosition | null {
        let prevCostX = this.look(new WorldPosition(worldPos.xx - dx, worldPos.yy));
        let prevCostY = this.look(new WorldPosition(worldPos.xx, worldPos.yy - dy));
        while (true) {
            if (this.heuristic(worldPos) === 0 || isNearBorderPos(worldPos.xx) || isNearBorderPos(worldPos.yy)) {
                break;
            }

            if (
                (this.look(new WorldPosition(worldPos.xx - dx, worldPos.yy + dy)) !== OBSTACLE && prevCostX !== cost) ||
                (this.look(new WorldPosition(worldPos.xx + dx, worldPos.yy - dy)) !== OBSTACLE && prevCostY !== cost)
            ) {
                break;
            }

            prevCostX = this.look(new WorldPosition(worldPos.xx, worldPos.yy + dy));
            prevCostY = this.look(new WorldPosition(worldPos.xx + dx, worldPos.yy));
            if (
                (prevCostY !== OBSTACLE && this.jumpX(cost, new WorldPosition(worldPos.xx + dx, worldPos.yy), dx) !== null) ||
                (prevCostX !== OBSTACLE && this.jumpY(cost, new WorldPosition(worldPos.xx, worldPos.yy + dy), dy) !== null)
            ) {
                break;
            }

            worldPos.xx += dx;
            worldPos.yy += dy;

            const jumpCost = this.look(worldPos);
            if (jumpCost === OBSTACLE) {
                return null;
            } else if (jumpCost !== cost) {
                break;
            }
        }

        return worldPos;
    }

    private jump(cost: Cost, worldPos: WorldPosition, dx: number, dy: number) {
        if (dx !== 0) {
            if (dy !== 0) {
                return this.jumpXY(cost, worldPos, dx, dy);
            } else {
                return this.jumpX(cost, worldPos, dx);
            }
        } else {
            return this.jumpY(cost, worldPos, dy);
        }
    }

    private jps(parentIndex: WorldPositionId, worldPos: WorldPosition, gCost: Cost): void {
        const posId = worldPos.getId();
        const parentPos: WorldPosition = WorldPosition.fromId(this.childToParentMapping.get(posId)!);
        const parentId = parentPos.getId();

        const dx = worldPos.xx > parentPos.xx ? 1 : (worldPos.xx < parentPos.xx ? -1 : 0);
        const dy = worldPos.yy > parentPos.yy ? 1 : (worldPos.yy < parentPos.yy ? -1 : 0);

        // First check to see if we're jumping to/from a border, options are limited
        const neighbors: WorldPosition[] = [];
        if (worldPos.xx % 50 === 0) {
            if (dx === -1) {
                neighbors.push(new WorldPosition(worldPos.xx - 1, worldPos.yy));
            } else if (dx === 1) {
                neighbors.push(new WorldPosition(worldPos.xx + 1, worldPos.yy - 1));
                neighbors.push(new WorldPosition(worldPos.xx + 1, worldPos.yy));
                neighbors.push(new WorldPosition(worldPos.xx + 1, worldPos.yy + 1));

            }
        } else if (worldPos.xx % 50 === 49) {
            if (dx === 1) {
                neighbors.push(new WorldPosition(worldPos.xx + 1, worldPos.yy));
            } else if (dx === -1) {
                neighbors.push(new WorldPosition(worldPos.xx - 1, worldPos.yy - 1));
                neighbors.push(new WorldPosition(worldPos.xx - 1, worldPos.yy));
                neighbors.push(new WorldPosition(worldPos.xx - 1, worldPos.yy + 1));
            }
        } else if (worldPos.yy % 50 === 0) {
            if (dy === -1) {
                neighbors.push(new WorldPosition(worldPos.xx, worldPos.yy - 1));
            } else if (dy === 1) {
                neighbors.push(new WorldPosition(worldPos.xx - 1, worldPos.yy + 1));
                neighbors.push(new WorldPosition(worldPos.xx, worldPos.yy + 1));
                neighbors.push(new WorldPosition(worldPos.xx + 1, worldPos.yy + 1));
            }
        } else if (worldPos.yy % 50 === 49) {
            if (dy === 1) {
                neighbors.push(new WorldPosition(worldPos.xx, worldPos.yy + 1));
            } else if (dy === -1) {
                neighbors.push(new WorldPosition(worldPos.xx - 1, worldPos.yy - 1));
                neighbors.push(new WorldPosition(worldPos.xx, worldPos.yy - 1));
                neighbors.push(new WorldPosition(worldPos.xx + 1, worldPos.yy - 1));
            }
        }

        // Add special nodes from the above blocks to the heap
        if (neighbors.length > 0) {
            for (let i = 0; i < neighbors.length; i++) {
                const nCost = this.look(neighbors[i]);
                if (nCost === OBSTACLE) {
                    continue
                }
                this.pushNode(parentIndex, neighbors[i], gCost + nCost);
            }
            return;
        }

        // Regular JPS iterations

        // First check if we're close to borders
        const borderDx = worldPos.xx % 50 === 1 ? -1 : worldPos.xx % 50 === 48 ? 1 : 0;
        const borderDy = worldPos.yy % 50 === 1 ? -1 : worldPos.yy % 50 === 48 ? 1 : 0;

        // Now execute the logic that is shared between diagonal and straight jumps
        const cost = this.look(worldPos);
        if (dx !== 0) {
            const neighbor = new WorldPosition(worldPos.xx + dx, worldPos.yy);
            const nCost = this.look(neighbor);
            if (nCost !== OBSTACLE) {
                if (borderDy === 0) {
                    this.jumpNeighbor(worldPos, parentIndex, neighbor, gCost, cost, nCost);
                } else {
                    this.pushNode(parentIndex, neighbor, gCost + nCost);
                }
            }
        }
        if (dy !== 0) {
            const neighbor = new WorldPosition(worldPos.xx, worldPos.yy + dy);
            const nCost = this.look(neighbor);
            if (nCost !== OBSTACLE) {
                if (borderDx === 0) {
                    this.jumpNeighbor(worldPos, parentIndex, neighbor, gCost, cost, nCost);
                } else {
                    this.pushNode(parentIndex, neighbor, gCost + nCost);
                }
            }
        }

        // Forced neighbor rules
        if (dx !== 0) {
            if (dy !== 0) { // Jump diagonally
                const neighbor = new WorldPosition(worldPos.xx + dx, worldPos.yy + dy);
                const nCost = this.look(neighbor);
                if (nCost !== OBSTACLE) {
                    this.jumpNeighbor(worldPos, parentIndex, neighbor, gCost, cost, nCost);
                }
                if (this.look(new WorldPosition(worldPos.xx - dx, worldPos.yy)) !== cost) {
                    this.jumpNeighbor(worldPos, parentIndex, new WorldPosition(worldPos.xx - dx, worldPos.yy + dy), gCost, cost, this.look(new WorldPosition(worldPos.xx - dx, worldPos.yy + dy)));
                }
                if (this.look(new WorldPosition(worldPos.xx, worldPos.yy - dy)) !== cost) {
                    this.jumpNeighbor(worldPos, parentIndex, new WorldPosition(worldPos.xx + dx, worldPos.yy - dy), gCost, cost, this.look(new WorldPosition(worldPos.xx + dx, worldPos.yy - dy)));
                }
            } else { // Jump left/right
                if (borderDy === 1 || this.look(new WorldPosition(worldPos.xx, worldPos.yy + 1)) !== cost) {
                    this.jumpNeighbor(worldPos, parentIndex, new WorldPosition(worldPos.xx + dx, worldPos.yy + 1), gCost, cost, this.look(new WorldPosition(worldPos.xx + dx, worldPos.yy + 1)));
                }
                if (borderDy === -1 || this.look(new WorldPosition(worldPos.xx, worldPos.yy - 1)) !== cost) {
                    this.jumpNeighbor(worldPos, parentIndex, new WorldPosition(worldPos.xx + dx, worldPos.yy - 1), gCost, cost, this.look(new WorldPosition(worldPos.xx + dx, worldPos.yy - 1)));
                }
            }
        } else { // Jump up/down
            if (borderDx === 1 || this.look(new WorldPosition(worldPos.xx + 1, worldPos.yy)) !== cost) {
                this.jumpNeighbor(worldPos, parentIndex, new WorldPosition(worldPos.xx + 1, worldPos.yy + dy), gCost, cost, this.look(new WorldPosition(worldPos.xx + 1, worldPos.yy + dy)));
            }
            if (borderDx === -1 || this.look(new WorldPosition(worldPos.xx - 1, worldPos.yy)) !== cost) {
                this.jumpNeighbor(worldPos, parentIndex, new WorldPosition(worldPos.xx - 1, worldPos.yy + dy), gCost, cost, this.look(new WorldPosition(worldPos.xx - 1, worldPos.yy + dy)));
            }
        }
    }

    private jumpNeighbor(
        worldPos: WorldPosition,
        parentId: WorldPositionId,
        neighbor: WorldPosition,
        gCost: Cost,
        cost: Cost,
        nCost: Cost) {
        if (nCost !== cost || isBorderPos(neighbor.xx) || isBorderPos(neighbor.yy)) {
            if (nCost === OBSTACLE) {
                return;
            }
            gCost += nCost;
            this.pushNode(parentId, neighbor, gCost);
        } else {
            const newNeighbor = this.jump(nCost, neighbor, neighbor.xx - worldPos.xx, neighbor.yy - worldPos.yy);
            if (newNeighbor === null) {
                return;
            }
            gCost += nCost * (worldPos.getRangeTo(neighbor) - 1) + this.look(neighbor);
            this.pushNode(parentId, newNeighbor, gCost);
        }
    }

    // Returns the minimum chebyshev distance to a goal
    private heuristic(pos: WorldPosition): Cost {
        if (this.flee) {
            let cost = 0;
            for (let i = 0; i < this.goals.length; i++) {
                const dist = pos.getRangeTo(this.goals[i].pos);
                if (dist < this.goals[i].range) {
                    cost = Math.max(cost, this.goals[i].range - dist);
                }
            }
            return cost;
        } else {
            let cost = Number.MAX_SAFE_INTEGER;
            for (let i = 0; i < this.goals.length; i++) {
                const dist = pos.getRangeTo(this.goals[i].pos);
                if (dist > this.goals[i].range) {
                    cost = Math.min(cost, dist - this.goals[i].range);
                } else {
                    cost = 0;
                }
            }
            return cost;
        }
    }

}

const isBorderPos = function (v: number): boolean {
    return (v + 1) % 50 < 2;
}

const isNearBorderPos = function (v: number): boolean {
    return (v + 2) % 50 < 4;
}
