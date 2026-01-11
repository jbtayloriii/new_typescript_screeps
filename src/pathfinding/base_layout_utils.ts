import { BaseLayoutMap, BasePlanningCoordinateString, Coordinate, CoordinateString } from "global_types";
import { BaseLayoutMapObj } from "./base_layout_map_obj";

// Edges around a center location, for forming a 3x3 square
const CENTER_RING_OFFSETS: Coordinate[] = [
    { x: -1, y: -1 },
    { x: -1, y: 1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
];

// Buildings to build around the center ring. Skips the initial spawn
// This MUST be 7 elements or less
const CENTER_BUILDINGS: { level: number, building: BuildableStructureConstant }[] = [
    { level: 1, building: STRUCTURE_ROAD },
    { level: 3, building: STRUCTURE_TOWER },
    { level: 4, building: STRUCTURE_STORAGE },
    { level: 5, building: STRUCTURE_LINK },
    { level: 6, building: STRUCTURE_TERMINAL },
    { level: 7, building: STRUCTURE_FACTORY },
    { level: 8, building: STRUCTURE_NUKER },
];

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
    let spawnCoord: Coordinate = { x: spawns[0].pos.x, y: spawns[0].pos.y };

    let baseMap = new BaseLayoutMapObj();

    // search around the initial location for a center, this cannot be the center.
    let centerLocation = getInitialBaseCenter(spawnCoord, squareDistances);
    if (centerLocation === null) {
        throw new BaseLayoutError(`Cannot find suitable center location for ${spawns[0].pos}`);
    }
    createRoomCore(centerLocation, spawnCoord, room, baseMap);

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
export function getInitialBaseCenter(initialCoordinate: Coordinate, squareDistances: number[][]): Coordinate | null {
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

function createRoomCore(centerLocation: Coordinate, spawnCoord: Coordinate, room: Room, baseMap: BaseLayoutMapObj): void {
    // Add roads around 3x3 center, leaving corners
    for (let i = -1; i <= 1; i++) {
        baseMap.addBuilding(1, { x: centerLocation.x + i, y: centerLocation.y - 2 }, STRUCTURE_ROAD);
        baseMap.addBuilding(1, { x: centerLocation.x + i, y: centerLocation.y + 2 }, STRUCTURE_ROAD);
        baseMap.addBuilding(1, { x: centerLocation.x - 2, y: centerLocation.y + i }, STRUCTURE_ROAD);
        baseMap.addBuilding(1, { x: centerLocation.x + 2, y: centerLocation.y + i }, STRUCTURE_ROAD);
    }

    // Add remaining buildings as a ring around, skipping spawn
    let centerBuildingIndex = 0;
    for (let i = 0; i < CENTER_RING_OFFSETS.length; i++) {
        let nextCoord: Coordinate = {
            x: centerLocation.x + CENTER_RING_OFFSETS[i].x,
            y: centerLocation.y + CENTER_RING_OFFSETS[i].y,
        };

        // TODO: Don't assume spawn is already spawned
        if (nextCoord.x === spawnCoord.x && nextCoord.y === spawnCoord.y) {
            baseMap.addBuilding(1, nextCoord, STRUCTURE_SPAWN);
        } else {
            baseMap.addBuilding(
                CENTER_BUILDINGS[centerBuildingIndex].level,
                nextCoord,
                CENTER_BUILDINGS[centerBuildingIndex].building);
            centerBuildingIndex++;
        }
    }

    // Start center rampart at 5 for now
    baseMap.addBuilding(5, centerLocation, STRUCTURE_RAMPART);
}
