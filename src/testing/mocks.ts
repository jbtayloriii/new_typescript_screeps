import * as _ from "lodash";
import { PfCostMatrix } from "./pathfinding/cost_matrix";
import { MockRoom, RoomPositionLike, TerrainData } from "./pathfinding/types";
import { MockPathFinder } from "./pathfinding/pf";
import { WorldPosition } from "./pathfinding/world_position";
import { MapPosition } from "./pathfinding/map_position";

declare const global: Record<string, unknown>;

type PathFinderRangeGoal = { pos: RoomPositionLike, range: number };

type PathFinderGoal = RoomPositionLike | PathFinderRangeGoal;

type PathFinderWorldGoal = {
    pos: WorldPosition,
    range: number,
}


type PathFinderSearchOptions = {
    roomCallback: ((roomName: string) => PfCostMatrix | false) | undefined;
    plainCost: number;
    swampCost: number;
    flee: boolean;
    maxOps: number;
    maxRooms: number;
    maxCost: number;
    heuristicWeight: number;
}

type PfSearchResponse = {
    path: RoomPositionLike[];
    ops: number;
    cost: number;
    incomplete: boolean;
}

// From https://github.com/screeps/driver/blob/master/lib/path-finder.js
const kWorldSize = 255;

const roomNameToMapPosition = function (roomName: string): MapPosition {
    let room = /^([WE])([0-9]+)([NS])([0-9]+)$/.exec(roomName);
    if (!room) {
        throw new Error('Invalid room name');
    }
    let rx = (kWorldSize >> 1) + (room[1] === 'W' ? -Number(room[2]) : Number(room[2]) + 1);
    let ry = (kWorldSize >> 1) + (room[3] === 'N' ? -Number(room[4]) : Number(room[4]) + 1);
    if (!(rx >= 0 && rx <= kWorldSize && ry >= 0 && ry <= kWorldSize)) {
        throw new Error('Invalid room name');
    }
    return new MapPosition(rx, ry);
}

/** Generates a Room Name from a MapPosition coordinate pair */

const toWorldPosition = function (rp: RoomPositionLike): WorldPosition {
    let xx = rp.x | 0, yy = rp.y | 0;
    if (!(xx >= 0 && xx < 50 && yy >= 0 && yy < 50)) {
        throw new Error('Invalid room position');
    }
    let offset = roomNameToMapPosition(rp.roomName);
    return new WorldPosition(xx + offset.xx * 50, yy + offset.yy * 50);
}

const fromWorldPosition = function (wp: WorldPosition): RoomPositionLike {
    return {
        x: wp.xx % 50,
        y: wp.yy % 50,
        roomName: wp.getMapPosition().toRoomName(),
    };
}

const mod = new MockPathFinder();

export const initRooms = function (rooms: MockRoom[]) {
    let terrainData: TerrainData[] = [];
    rooms.forEach(room => {
        terrainData.push({
            room: roomNameToMapPosition(room.room),
            vals: room.terrain,
        });
    });

    mod.loadTerrain(terrainData);
};

const search = function (
    origin: RoomPositionLike,
    goal: PathFinderGoal | PathFinderGoal[],
    options: PathFinderSearchOptions): PfSearchResponse {

    // Options
    options = options || {};
    let plainCost = Math.min(254, Math.max(1, (options.plainCost | 0) || 1));
    let swampCost = Math.min(254, Math.max(1, (options.swampCost | 0) || 5));
    let heuristicWeight = Math.min(9, Math.max(1, options.heuristicWeight || 1.2));
    let maxOps = Math.max(1, (options.maxOps | 0) || 2000);
    let maxCost = Math.max(1, (options.maxCost | 0) || 0xffffffff);
    let maxRooms = Math.min(64, Math.max(1, (options.maxRooms | 0) || 16));
    let flee = !!options.flee;

    // Convert one-or-many goal into standard format for native extension
    const worldGoals: PathFinderWorldGoal[] = _.map(Array.isArray(goal) ? goal : [goal], function (goal: PathFinderGoal) {
        if ("x" in goal && goal.x !== undefined && goal.y !== undefined && goal.roomName !== undefined) {
            return {
                range: 0,
                pos: toWorldPosition(goal),
            };
        } else {
            const rangeGoal = goal as PathFinderRangeGoal;
            let range = Math.max(0, rangeGoal.range | 0);
            return {
                range: range,
                pos: toWorldPosition(rangeGoal.pos),
            };
        }
    });

    // Convert room callback into a function that takes in a map position to return a cost matrix
    let finalCallback: ((mapPos: MapPosition) => PfCostMatrix | false | undefined) | null = null;
    if (options.roomCallback) {
        if (typeof options.roomCallback !== 'function') {
            finalCallback = null;
        } else {
            finalCallback = function (cb) {
                return function (mapPos: MapPosition) {
                    let ret = cb(mapPos.toRoomName());
                    if (ret === false) {
                        return ret;
                    } else if (ret) {
                        return ret;
                    }
                };
            }(options.roomCallback);
        }
    }

    // Invoke 'native' code
    let ret = mod.search(
        toWorldPosition(origin),
        worldGoals,
        finalCallback,
        plainCost,
        swampCost,
        maxRooms,
        maxOps,
        maxCost,
        flee,
        heuristicWeight);

    if (ret === undefined) {
        return { path: [], ops: 0, cost: 0, incomplete: false };
    } else if (ret === -1) {
        return { path: [], ops: 0, cost: 0, incomplete: true };
    }

    return {
        path: ret.path.map(fromWorldPosition).reverse(),
        ops: ret.ops,
        cost: ret.cost,
        incomplete: ret.incomplete,
    };
};

export const setupMocks = () => {
    global.PathFinder = {
        search: search,
        CostMatrix: PfCostMatrix,
    }

    global.MockPathFinder = {
        initRooms: initRooms,
    }

};
