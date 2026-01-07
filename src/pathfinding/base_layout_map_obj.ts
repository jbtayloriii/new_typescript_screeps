import { BaseLayoutMap, Coordinate } from "global_types";
import { PositionToBasePlan } from "utils/string_utils";


export class BaseLayoutMapObj {
    private internalMap: BaseLayoutMap = new ();

    public BaseLayoutMapObj() {
        for (let i = 1; i <= 8; i++) {
            this.internalMap.set(i, [])
        }
    }

    public addBuilding(level: number, coord: Coordinate, type: BuildableStructureConstant) {
        if (level < 1 || level > 8) {
            throw new Error(`Attempting to add a base plan building at level ${level}`);
        }
        this.internalMap.get(level)!.push(PositionToBasePlan(coord, type));
    }


    public toSerializedMap(): BaseLayoutMap {
        return this.internalMap;
    }
}
