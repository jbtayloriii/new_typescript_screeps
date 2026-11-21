import { StructureSnapshot } from "snapshot/types";

/** Hit points to keep walls and ramparts at, by controller level. */
export const WALL_TARGET_HITS_BY_RCL: readonly number[] = [0, 0, 10000, 30000, 100000, 300000, 1000000, 3000000, 10000000];

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

/** True if a structure that isn't someone else's is below its repair target. */
export function needsRepair(structure: StructureSnapshot, rcl: number): boolean {
    return structure.owner !== 'other' && structure.hits < repairTargetHits(structure, rcl);
}
