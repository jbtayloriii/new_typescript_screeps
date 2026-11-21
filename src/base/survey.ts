import { Coordinate } from "global_types";
import { encodeRoute } from "tasks/remote_roads";
import { REMOTE_DISTANCE_ESTIMATE } from "tasks/remote_mine_task";
import { basePlanCoordToBuildingObj } from "utils/string_utils";

/** A remote room the survey should measure: its name and source positions (from intel). */
export interface RemoteToSurvey {
    readonly targetRoom: RoomName;
    readonly sources: readonly { readonly id: string; readonly x: number; readonly y: number }[];
}

/** Rooms a path to a remote may cross (the base, the remote, and a room in between). */
const REMOTE_PATH_MAX_ROOMS = 4;

/**
 * One-time measurements of a base that need game APIs (PathFinder, terrain), saved in BaseMemory
 * so pure decisions can use them. Runs for any field still missing, so existing bases fill them
 * in on the next tick:
 * - path lengths from the spawn to each source and each remote source;
 * - the controller container's tile;
 * - a road route to each remote room (built later, in stages: see `tasks/remote_roads.ts`).
 * Remote measurements for rooms that are no longer remotes are dropped.
 */
export function surveyBase(room: Room, baseMemory: BaseMemory, remotes: readonly RemoteToSurvey[] = []): void {
    const [x, y] = baseMemory.initialSpawn.split('_').map(Number);
    const spawnPos = new RoomPosition(x, y, room.name);

    if (!baseMemory.sourceDistances) {
        const distances: { [sourceId: string]: number } = {};
        for (const source of room.find(FIND_SOURCES)) {
            distances[source.id] = PathFinder.search(spawnPos, { pos: source.pos, range: 1 }, { maxRooms: 1 }).path.length;
        }
        baseMemory.sourceDistances = distances;
    }

    if (!baseMemory.controllerContainer && room.controller) {
        const terrain = room.getTerrain();
        const planned = new Set(Object.values(baseMemory.baseLayout).flat()
            .map(basePlanCoordToBuildingObj)
            .map(({ coord }) => `${coord.x}_${coord.y}`));
        baseMemory.controllerContainer = chooseControllerContainerTile(
            room.controller.pos, { x, y }, (tx, ty) => terrain.get(tx, ty) === TERRAIN_MASK_WALL, planned);
    }

    surveyRemotes(room, baseMemory, spawnPos, remotes);
}

function surveyRemotes(room: Room, baseMemory: BaseMemory, spawnPos: RoomPosition, remotes: readonly RemoteToSurvey[]): void {
    const distances = baseMemory.remoteDistances ?? {};
    const routes = baseMemory.remoteRoutes ?? {};
    const keepSources = new Set(remotes.flatMap(r => r.sources.map(s => s.id)));
    const keepRooms = new Set(remotes.map(r => r.targetRoom));
    for (const id of Object.keys(distances)) {
        if (!keepSources.has(id)) delete distances[id];
    }
    for (const target of Object.keys(routes)) {
        if (!keepRooms.has(target)) delete routes[target];
    }

    const roomCallback = roadPreferringCosts(room.name, baseMemory);
    for (const remote of remotes) {
        if (remote.sources.length === 0 || (routes[remote.targetRoom] && remote.sources.every(s => distances[s.id] !== undefined))) {
            continue;
        }
        let route: RemoteRoute = [];
        for (const source of remote.sources) {
            const result = PathFinder.search(spawnPos, { pos: new RoomPosition(source.x, source.y, remote.targetRoom), range: 1 }, {
                plainCost: 2,
                swampCost: 10,
                maxRooms: REMOTE_PATH_MAX_ROOMS,
                roomCallback,
            });
            if (result.incomplete) {
                // Keep the estimate rather than searching again every tick.
                distances[source.id] = REMOTE_DISTANCE_ESTIMATE;
                continue;
            }
            distances[source.id] = result.path.length;
            route = encodeRoute(result.path, route);
        }
        // Saved even when empty (no complete path), so the search isn't repeated every tick.
        routes[remote.targetRoom] = route;
    }
    baseMemory.remoteDistances = distances;
    baseMemory.remoteRoutes = routes;
}

/**
 * Cost matrices for planning remote routes: existing roads and the base layout's planned roads
 * are cheap (so routes reuse them), and other buildings block.
 */
function roadPreferringCosts(homeRoom: RoomName, baseMemory: BaseMemory): (roomName: RoomName) => CostMatrix | boolean {
    return (roomName) => {
        const costs = new PathFinder.CostMatrix();
        if (roomName === homeRoom) {
            for (const coordString of Object.values(baseMemory.baseLayout).flat()) {
                const { coord, structure } = basePlanCoordToBuildingObj(coordString);
                costs.set(coord.x, coord.y, structure === STRUCTURE_ROAD ? 1
                    : structure === STRUCTURE_CONTAINER || structure === STRUCTURE_RAMPART ? 2 : 0xff);
            }
        }
        const visible = Game.rooms[roomName];
        if (visible) {
            for (const s of visible.find(FIND_STRUCTURES)) {
                if (s.structureType === STRUCTURE_ROAD) {
                    costs.set(s.pos.x, s.pos.y, 1);
                } else if (s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART) {
                    costs.set(s.pos.x, s.pos.y, 0xff);
                }
            }
        }
        return costs;
    };
}

/**
 * Picks the controller container's tile: 2 tiles from the controller (so upgraders at range 1–3
 * can reach both), not a wall, not on a planned layout tile and not on the room edge. Closest to
 * the spawn by range, ties broken by Manhattan distance (the most direct tile), then scan order.
 */
export function chooseControllerContainerTile(
    controller: Coordinate,
    spawn: Coordinate,
    isWall: (x: number, y: number) => boolean,
    plannedTiles: ReadonlySet<string>): Coordinate | undefined {
    let best: Coordinate | undefined;
    let bestScore: [number, number] = [Infinity, Infinity];
    for (let y = controller.y - 2; y <= controller.y + 2; y++) {
        for (let x = controller.x - 2; x <= controller.x + 2; x++) {
            if (Math.max(Math.abs(x - controller.x), Math.abs(y - controller.y)) !== 2) continue;
            if (x < 1 || y < 1 || x > 48 || y > 48) continue;
            if (isWall(x, y) || plannedTiles.has(`${x}_${y}`)) continue;
            const dx = Math.abs(x - spawn.x);
            const dy = Math.abs(y - spawn.y);
            const score: [number, number] = [Math.max(dx, dy), dx + dy];
            if (score[0] < bestScore[0] || (score[0] === bestScore[0] && score[1] < bestScore[1])) {
                best = { x, y };
                bestScore = score;
            }
        }
    }
    return best;
}
