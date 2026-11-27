import { StructureSnapshot } from "snapshot/types";
import { basePlanCoordToBuildingObj } from "utils/string_utils";

/** Hit points to keep walls and ramparts at, by controller level. */
export const WALL_TARGET_HITS_BY_RCL: readonly number[] = [0, 0, 10000, 30000, 100000, 300000, 1000000, 3000000, 10000000];

/**
 * Tiles ("x_y") where the base layout plans a wall. Walls have no owner, so this is how our walls
 * are told apart from ones left behind by a room's previous owner.
 */
export function plannedWallTiles(baseLayout: BaseMemory['baseLayout']): ReadonlySet<string> {
    const tiles = new Set<string>();
    for (const coords of Object.values(baseLayout)) {
        for (const coordString of coords) {
            const { coord, structure } = basePlanCoordToBuildingObj(coordString);
            if (structure === STRUCTURE_WALL) {
                tiles.add(`${coord.x}_${coord.y}`);
            }
        }
    }
    return tiles;
}

/**
 * The hits a structure should be repaired up to: full for normal structures, and a target that
 * grows with RCL for walls and ramparts (whose max hits are far too high to fill early on).
 */
export function repairTargetHits(structure: StructureSnapshot, rcl: number): number {
    if (structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART) {
        return Math.min(structure.hitsMax, WALL_TARGET_HITS_BY_RCL[Math.max(0, Math.min(8, rcl))]);
    }
    return structure.hitsMax;
}

/**
 * True if a structure is below its repair target and is ours to keep up: not someone else's,
 * and, for walls, planned by the base layout (`plannedWalls`, see `plannedWallTiles`). Walls a
 * previous owner left are not repaired: in W13S14 towers spent about 20% of the base's income
 * raising 61 of them.
 */
export function needsRepair(structure: StructureSnapshot, rcl: number, plannedWalls: ReadonlySet<string>): boolean {
    if (structure.owner === 'other') {
        return false;
    }
    if (structure.structureType === STRUCTURE_WALL && !plannedWalls.has(`${structure.pos.x}_${structure.pos.y}`)) {
        return false;
    }
    return structure.hits < repairTargetHits(structure, rcl);
}
