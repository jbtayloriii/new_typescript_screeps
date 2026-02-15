import { BaseLayoutMap, Coordinate } from "global_types";
import { BaseLayoutMapObj } from "./base_layout_map_obj";
import { getDiamondMapping, getSquareMapping, Position } from "./map_plot_utils";

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

// Spaces to look for expansion diamonds around the center location
const CENTER_RING_TO_EXPANSION_OFFSETS: Coordinate[] = [
    { x: 3, y: 2 },
    { x: 2, y: 3 },
    { x: -3, y: 2 },
    { x: -2, y: 3 },
    { x: 3, y: -2 },
    { x: 2, y: -3 },
    { x: -3, y: -2 },
    { x: -2, y: -3 },
];

// Buildings to build around the center ring. Skips the initial spawn
// This MUST be 7 elements or less
const CENTER_BUILDINGS: { level: number, building: BuildableStructureConstant }[] = [
    { level: 2, building: STRUCTURE_ROAD },
    { level: 3, building: STRUCTURE_TOWER },
    { level: 4, building: STRUCTURE_STORAGE },
    { level: 5, building: STRUCTURE_LINK },
    { level: 6, building: STRUCTURE_TERMINAL },
    { level: 7, building: STRUCTURE_FACTORY },
    { level: 8, building: STRUCTURE_NUKER },
];

// A star shaped stamp that is used for placing extensions:
// . . r . .
// . r x r .
// r x x x r
// . r x r .
// . . r . .
const EXPANSION_STAMP: { x: number, y: number, buildingType: BuildableStructureConstant }[] = [
    { x: 0, y: 0, buildingType: STRUCTURE_EXTENSION },
    { x: 1, y: 0, buildingType: STRUCTURE_EXTENSION },
    { x: -1, y: 0, buildingType: STRUCTURE_EXTENSION },
    { x: 0, y: 1, buildingType: STRUCTURE_EXTENSION },
    { x: 0, y: -1, buildingType: STRUCTURE_EXTENSION },
    { x: -2, y: 0, buildingType: STRUCTURE_ROAD },
    { x: -1, y: -1, buildingType: STRUCTURE_ROAD },
    { x: 0, y: -2, buildingType: STRUCTURE_ROAD },
    { x: 1, y: -1, buildingType: STRUCTURE_ROAD },
    { x: 2, y: 0, buildingType: STRUCTURE_ROAD },
    { x: 1, y: 1, buildingType: STRUCTURE_ROAD },
    { x: 0, y: 2, buildingType: STRUCTURE_ROAD },
    { x: -1, y: 1, buildingType: STRUCTURE_ROAD },
];

// Tracks which level each extension stamp should be. For example, level 3 allows for 10
// extensions and level 4 allows for 20, so stamps 3 and 4 (indices 2 and 3) would be for level 4.
const LEVEL_PER_EXTENSION_STAMP: number[] = [
    2,
    3,
    4, 4,
    5, 5,
    6, 6,
    7, 7,
    8, 8,
]

export class BaseLayoutError extends Error { }

// Support a 3x3 square, plus roads. This is 5x5 total, or radius 3
const BASE_CENTER_RADIUS = 3;

export function getBaseLayoutForSpawn(initialSpawn: StructureSpawn): BaseLayoutMap {
    // TODO: See if there's a cheaper way to do this
    const walls: Position[] = [];
    const terrain = initialSpawn.room.getTerrain();
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            if (terrain.get(x, y) == TERRAIN_MASK_WALL) {
                walls.push({ x: x, y: y });
            }
        }
    }

    const diamondDistances = getDiamondMapping(walls, /* mapSize= */ 50);
    const squareDistances = getSquareMapping(walls, /* mapSize= */ 50);

    let sources: Source[] = initialSpawn.room.find(FIND_SOURCES);

    return getBaseLayout(initialSpawn.pos, sources, diamondDistances, squareDistances, /* mapSize= */ 50);
}

/**
 * Creates a base layout given an initial core location and precomputed distance maps.
 * @throws {BaseLayoutError} if a base layout cannot be successfully determined.
 */
export function getBaseLayout(
    initialSpawnPosition: RoomPosition,
    sources: Source[],
    diamondDistances: number[][],
    squareDistances: number[][],
    mapSize: number): BaseLayoutMap {

    let baseMap = new BaseLayoutMapObj(mapSize);

    // Search around the initial location for a center, this cannot be the center.
    let centerLocation = getInitialBaseCenter(initialSpawnPosition, squareDistances);
    if (centerLocation === null) {
        throw new BaseLayoutError(`Cannot find suitable center location for ${initialSpawnPosition}`);
    }
    createRoomCore(centerLocation, initialSpawnPosition, baseMap);

    // Create the expansions around the base center now
    addBaseExtensions(centerLocation, diamondDistances, baseMap);

    const baseMatrix = baseMap.getCostMatrix();

    // TODO: Add paths to sources/controller, and downlevel roads on those paths
    sources.forEach(source => {
        const opts: PathFinderOpts = {
            plainCost: 1,
            swampCost: 5,
            roomCallback: _ => baseMatrix,
        };

        const { path: pathArr, incomplete: isIncomplete, ops: opsTaken } = PathFinder.search(initialSpawnPosition, {
            pos: source.pos,
            range: 1,
        }, opts);

        pathArr.forEach((v, idx) => {
            if (idx < pathArr.length - 1) {
                baseMap.addBuilding(2, { x: v.x, y: v.y }, STRUCTURE_ROAD);
            } else {
                baseMap.addBuilding(2, { x: v.x, y: v.y }, STRUCTURE_CONTAINER);
            }
        });
    });

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

function createRoomCore(centerLocation: Coordinate, spawnCoord: Coordinate, baseMap: BaseLayoutMapObj): void {
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

function addBaseExtensions(baseCenter: Coordinate, diamondDistances: number[][], baseMap: BaseLayoutMapObj): void {
    // Initialize
    let expansionQueue: Coordinate[] = [];
    for (let i = 0; i < CENTER_RING_TO_EXPANSION_OFFSETS.length; i++) {
        const nextSpot = CENTER_RING_TO_EXPANSION_OFFSETS[i];
        expansionQueue.push({ x: baseCenter.x + nextSpot.x, y: baseCenter.y + nextSpot.y });
    }

    const canStampFn = function (center: Coordinate): boolean {
        if (diamondDistances[center.y][center.x] < 3) {
            return false;
        }
        for (let i = 0; i < EXPANSION_STAMP.length; i++) {
            const nextCoord = { x: center.x + EXPANSION_STAMP[i].x, y: center.y + EXPANSION_STAMP[i].y };
            if (!baseMap.isOpenOrType(nextCoord, EXPANSION_STAMP[i].buildingType)) {
                return false;
            }
        }
        return true;
    }

    // Loop through queue
    let maxIterations = 50;
    let currentLevelIdx = 0;
    while (expansionQueue.length > 0 && maxIterations > 0 && currentLevelIdx < LEVEL_PER_EXTENSION_STAMP.length) {
        const nextCoord = expansionQueue.shift()!;
        if (canStampFn(nextCoord)) {
            const nextLevel = LEVEL_PER_EXTENSION_STAMP[currentLevelIdx++];
            // console.log(`Stamping at level ${nextLevel}`);
            for (let i = 0; i < EXPANSION_STAMP.length; i++) {
                const stampCoord = { x: nextCoord.x + EXPANSION_STAMP[i].x, y: nextCoord.y + EXPANSION_STAMP[i].y };
                baseMap.addBuilding(nextLevel, stampCoord, EXPANSION_STAMP[i].buildingType);
            }
            expansionQueue.push({ x: nextCoord.x + 2, y: nextCoord.y + 2 });
            expansionQueue.push({ x: nextCoord.x - 2, y: nextCoord.y + 2 });
            expansionQueue.push({ x: nextCoord.x + 2, y: nextCoord.y - 2 });
            expansionQueue.push({ x: nextCoord.x - 2, y: nextCoord.y - 2 });

        }
        maxIterations--;
    }
}
