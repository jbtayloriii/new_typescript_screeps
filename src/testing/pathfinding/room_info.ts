import { PfCostMatrix } from "./cost_matrix";
import { MapPosition } from "./map_position";



export class RoomInfo {
    private terrainVals: number[][];
    public costMatrix: PfCostMatrix | null;
    public mapPosition: MapPosition;

    public constructor(terrainVals: number[][], costMatrix: PfCostMatrix | null, mapPosition: MapPosition) {
        this.costMatrix = costMatrix === null ? new PfCostMatrix() : costMatrix;
        this.terrainVals = terrainVals;
        this.mapPosition = mapPosition;
    }

    /** Returns the terrain at the given position. */
    public look(xx: number, yy: number): number {
        if (this.costMatrix !== null && this.costMatrix.get(xx, yy) !== undefined && this.costMatrix.get(xx, yy) !== 0) {
            return this.costMatrix.get(xx, yy)!;
        }

        return this.terrainVals[yy][xx];
    }
}
