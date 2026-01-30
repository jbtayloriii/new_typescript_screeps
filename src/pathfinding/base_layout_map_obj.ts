import { BaseLayoutMap, BasePlanningCoordinateString, Coordinate } from "global_types";
import { typeToSymbol } from "../utils/map_utils";
import { PositionToBasePlan } from "../utils/string_utils";

const _EMPTY_SPOT_CHAR = '.'

export class BaseLayoutMapObj {
    private internalMap: BaseLayoutMap = new Map<number, BasePlanningCoordinateString[]>();
    private internalArray: string[][];
    private costMatrix: CostMatrix;

    public constructor(mapSize: number) {
        for (let i = 1; i <= 8; i++) {
            this.internalMap.set(i, [])
        }
        this.internalArray = Array.from({ length: mapSize }, () => Array(mapSize).fill(_EMPTY_SPOT_CHAR));
        this.costMatrix = new PathFinder.CostMatrix();
    }

    public isOpen(coord: Coordinate): boolean {
        return this.internalArray[coord.y][coord.x] === _EMPTY_SPOT_CHAR;
    }

    public isOpenOrType(coord: Coordinate, buildingType: BuildableStructureConstant): boolean {
        if (typeToSymbol(buildingType) === this.internalArray[coord.y][coord.x]) {
            return true;
        }
        return this.isOpen(coord);
    }

    public addBuilding(level: number, coord: Coordinate, buildingType: BuildableStructureConstant) {
        // Allow setting the same building in multiple times
        const typeSymbol = typeToSymbol(buildingType);
        if (typeSymbol === this.internalArray[coord.y][coord.x]) {
            return;
        }
        if (this.internalArray[coord.y][coord.x] !== _EMPTY_SPOT_CHAR) {
            throw new Error(`Cannot add building ${buildingType}, there's alreayd a blueprint of ${this.internalArray[coord.y][coord.x]} here.`);
        }

        if (level < 1 || level > 8) {
            throw new Error(`Attempting to add a base plan building at level ${level}`);
        }
        this.internalMap.get(level)!.push(PositionToBasePlan(coord, buildingType));
        this.internalArray[coord.y][coord.x] = typeSymbol;
        this.costMatrix.set(coord.x, coord.y, buildingType === STRUCTURE_ROAD ? 1 : buildingType === STRUCTURE_SPAWN ? 1 : 0xff);
    }

    public getCostMatrix(): CostMatrix {
        return this.costMatrix;
    }


    public toSerializedMap(): BaseLayoutMap {
        return this.internalMap;
    }
}
