import { PfCostMatrix } from "./cost_matrix";
import { MapPosition } from "./map_position";
import { TerrainPackedBits } from "./types";



export class RoomInfo {

    private terrainData: TerrainPackedBits;
    public costMatrix: PfCostMatrix | null;
    public mapPosition: MapPosition;

    public constructor(terrainData: TerrainPackedBits, costMatrix: PfCostMatrix | null, mapPosition: MapPosition) {
        this.costMatrix = costMatrix === null ? new PfCostMatrix() : costMatrix;
        this.terrainData = terrainData;
        this.mapPosition = mapPosition;
    }

    /** Returns the terrain at the given position. */
    public look(xx: number, yy: number): number {
        if (this.costMatrix !== null && this.costMatrix.get(xx, yy) !== undefined) {
            return this.costMatrix.get(xx, yy)!;
        }

        const index = xx * 50 + yy;
        return 0x03 & this.terrainData[(index / 4) | 0] >> (index % 4 * 2);
    }
}
