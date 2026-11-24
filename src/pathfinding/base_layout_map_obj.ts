import { BaseLayoutMap, BasePlanningCoordinateString, Coordinate } from "global_types";
import { buildableStructureToChar, basePlanObjToBasePlanCoordString } from "../utils/string_utils";

const _EMPTY_SPOT_CHAR = '.';
/** A tile nothing may be planned on (e.g. a structure the layout doesn't plan). Never serialized. */
const _BLOCKED_SPOT_CHAR = '#';

/**
 * A base layout being planned: a plain grid of planned structures (one per tile) plus the RCL
 * each one unlocks at. Pure, so planning can be tested without Screeps mocks; the CostMatrix
 * for PathFinder steps is built on demand by `toCostMatrix`.
 */
export class BaseLayoutMapObj {
    private internalMap: BaseLayoutMap = {};
    private internalArray: string[][];
    private readonly mapSize: number;

    public constructor(mapSize: number) {
        this.mapSize = mapSize;
        for (let i = 1; i <= 8; i++) {
            this.internalMap[i] = [];
        }
        this.internalArray = Array.from({ length: mapSize }, () => Array(mapSize).fill(_EMPTY_SPOT_CHAR));
    }

    public inBounds(coord: Coordinate): boolean {
        return coord.x >= 0 && coord.y >= 0 && coord.x < this.mapSize && coord.y < this.mapSize;
    }

    public isOpen(coord: Coordinate): boolean {
        return this.inBounds(coord) && this.internalArray[coord.y][coord.x] === _EMPTY_SPOT_CHAR;
    }

    public isOpenOrType(coord: Coordinate, buildingType: BuildableStructureConstant): boolean {
        return this.isType(coord, buildingType) || this.isOpen(coord);
    }

    public isType(coord: Coordinate, buildingType: BuildableStructureConstant): boolean {
        return this.inBounds(coord) && buildableStructureToChar(buildingType) === this.internalArray[coord.y][coord.x];
    }

    /** Marks a tile so nothing can be planned there. */
    public block(coord: Coordinate): void {
        if (this.isOpen(coord)) {
            this.internalArray[coord.y][coord.x] = _BLOCKED_SPOT_CHAR;
        }
    }

    public addBuilding(level: number, coord: Coordinate, buildingType: BuildableStructureConstant) {
        // Allow setting the same building in multiple times
        const typeSymbol = buildableStructureToChar(buildingType);
        if (typeSymbol === this.internalArray[coord.y][coord.x]) {
            return;
        }
        if (this.internalArray[coord.y][coord.x] !== _EMPTY_SPOT_CHAR) {
            throw new Error(`Cannot add building ${buildingType}, there's already a blueprint of ${this.internalArray[coord.y][coord.x]} here.`);
        }

        if (level < 1 || level > 8) {
            throw new Error(`Attempting to add a base plan building at level ${level}`);
        }
        this.internalMap[level].push(basePlanObjToBasePlanCoordString(coord, buildingType));
        this.internalArray[coord.y][coord.x] = typeSymbol;
    }

    /**
     * A CostMatrix for planning roads around the layout: planned roads cost `roadCost`, anything
     * else planned (or blocked) can't be crossed. Only called by the PathFinder steps.
     */
    public toCostMatrix(roadCost: number): CostMatrix {
        const matrix = new PathFinder.CostMatrix();
        const road = buildableStructureToChar(STRUCTURE_ROAD);
        for (let y = 0; y < this.mapSize; y++) {
            for (let x = 0; x < this.mapSize; x++) {
                const symbol = this.internalArray[y][x];
                if (symbol === road) {
                    matrix.set(x, y, roadCost);
                } else if (symbol !== _EMPTY_SPOT_CHAR) {
                    matrix.set(x, y, 0xff);
                }
            }
        }
        return matrix;
    }

    public toSerializedMap(): BaseLayoutMap {
        return this.internalMap;
    }
}

/**
 * Returns all planned coordinates for controller levels in the range (fromLevelExclusive, toLevelInclusive].
 *
 * Used to find which buildings have been unlocked since the last time construction was planned.
 */
export function getLayoutCoordsBetweenLevels(
    layout: BaseLayoutMap,
    fromLevelExclusive: number,
    toLevelInclusive: number): BasePlanningCoordinateString[] {
    const coords: BasePlanningCoordinateString[] = [];
    for (let level = fromLevelExclusive + 1; level <= toLevelInclusive; level++) {
        const levelCoords = layout[level];
        if (levelCoords) {
            coords.push(...levelCoords);
        }
    }
    return coords;
}
