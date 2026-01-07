import { BaseLayoutMap, BasePlanningCoordinateString, Coordinate, CoordinateString } from "global_types";
import { CoordinateStringToCoordinate } from "utils/string_utils";
import { BaseLayoutMapObj } from "./base_layout_map_obj";


export class BaseLayoutError extends Error { }

// Support a 3x3 square, plus roads. This is 5x5 total, or radius 3
const BASE_CENTER_RADIUS = 3;

/**
 * Creates a base layout given an initial core location and precomputed distance maps.
 * @throws {BaseLayoutError} if a base layout cannot be successfully determined.
 */
export function getBaseLayout(room: Room, diamondDistances: number[][], squareDistances: [][], walls: Coordinate[], mapSize: number): BaseLayoutMap {
    // TODO: Don't assume there's already a spawn in the room, allow for empty rooms
    let spawns = room.find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_SPAWN },
    }) as StructureSpawn[];
    if (spawns.length !== 1) {
        throw new BaseLayoutError(`Could not find initial spawn at ${room.name} for base planning`);
    }

    let baseMap = new BaseLayoutMapObj();

    // search around the initial location for a center, this cannot be the center.
    let centerLocation = getInitialBaseCenter(spawns[0].pos, squareDistances);
    if (centerLocation === null) {
        throw new BaseLayoutError(`Cannot find suitable center location for ${spawns[0].pos}`);
    }
    createRoomCore(centerLocation, room, baseMap);

    return baseMap.toSerializedMap();
}

/** 
 * Gets an initial center for the base, or returns null if no center can be found.
 * @param initialCoordinate: The initial coordinate to search from. This should
 *     be something in the "core" square of a base (like a Spawn).
 * @param squareDistances: The calculated minimum 8-way distances to walls/edges
 *     for each square in the map.
 * @return A coordinate that satisfies a base center, or null if no coordinate
 *     can be found. 
*/
function getInitialBaseCenter(initialCoordinate: Coordinate, squareDistances: number[][]): Coordinate | null {
    for (let y = initialCoordinate.y - 1; y <= initialCoordinate.y + 1; y++) {
        for (let x = initialCoordinate.x - 1; x <= initialCoordinate.x + 1; x++) {
            if (x == initialCoordinate.x && y == initialCoordinate.y) {
                continue;
            }
            if (squareDistances[y][x] >= BASE_CENTER_RADIUS) {
                return { x: x, y: y };
            }
        }
    }
    return null;
}

function createRoomCore(centerLocation: Coordinate, room: Room, baseMap: BaseLayoutMapObj): void {
    // Add roads around edge
    for (let i = 0; i < 5; i++) {

    }
}
