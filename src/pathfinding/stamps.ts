/**
 * Stamps for the base layout (see docs/BASE_LAYOUT.md): the extension, tower and spawn stamps,
 * which share one footprint and sit on the same grid, and the lab stamp.
 */

export interface StampTile {
    readonly dx: number;
    readonly dy: number;
    readonly structure: BuildableStructureConstant;
    readonly level: number;
}

/**
 * The shared footprint of the grid stamps: a plus of 5 (the body) ringed by 8 roads.
 *
 * . . r . .
 * . r B r .
 * r B B B r
 * . r B r .
 * . . r . .
 */
export const STAMP_BODY: readonly { dx: number, dy: number }[] = [
    { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
];
export const STAMP_ROADS: readonly { dx: number, dy: number }[] = [
    { dx: -2, dy: 0 }, { dx: -1, dy: -1 }, { dx: 0, dy: -2 }, { dx: 1, dy: -1 },
    { dx: 2, dy: 0 }, { dx: 1, dy: 1 }, { dx: 0, dy: 2 }, { dx: -1, dy: 1 },
];

export type StampKind = 'extension' | 'tower' | 'spawn';

/**
 * What a grid slot holds. `level` is the RCL the stamp starts at: an extension stamp's whole
 * level, the tower stamp's 5 (tower 2) and the spawn stamp's 7 (spawn 2).
 */
export interface StampAssignment {
    readonly kind: StampKind;
    readonly level: number;
}

const ext = (level: number): StampAssignment => ({ kind: 'extension', level });
export const TOWER_STAMP: StampAssignment = { kind: 'tower', level: 5 };
export const SPAWN_STAMP: StampAssignment = { kind: 'spawn', level: 7 };

/**
 * What the grid slots hold, in the order the slot search finds them (closest to the core first).
 * The early extensions keep the closest slots; the tower and spawn stamps come next, ahead of the
 * RCL 5–8 extensions.
 */
export const STAMP_ORDER: readonly StampAssignment[] = [
    ext(2), ext(3), ext(4), ext(4),
    TOWER_STAMP, SPAWN_STAMP,
    ext(5), ext(5), ext(6), ext(6), ext(7), ext(7), ext(8), ext(8),
];

export function sameAssignment(a: StampAssignment, b: StampAssignment): boolean {
    return a.kind === b.kind && a.level === b.level;
}

export function describeAssignment(a: StampAssignment): string {
    return a.kind === 'extension' ? `extensions (RCL ${a.level})` : `${a.kind} stamp`;
}

export interface StampOptions {
    /**
     * The spawn stamp's center holds the power spawn instead of a road, and its nuker tile is a
     * road. Used when a nuker is already built in the core ring.
     */
    readonly powerSpawnInSpawnStamp?: boolean;
}

/** The structures of a grid stamp, relative to the slot's center. */
export function stampTiles(assignment: StampAssignment, options: StampOptions = {}): StampTile[] {
    const roads = (level: number) => STAMP_ROADS.map(({ dx, dy }) => ({ dx, dy, structure: STRUCTURE_ROAD, level }));
    switch (assignment.kind) {
        case 'extension':
            return [
                ...STAMP_BODY.map(({ dx, dy }) => ({ dx, dy, structure: STRUCTURE_EXTENSION, level: assignment.level })),
                ...roads(assignment.level),
            ];
        case 'tower':
            // Tower 2 in the center (RCL 5), tower 3 (RCL 7), towers 4–6 (RCL 8).
            return [
                { dx: 0, dy: 0, structure: STRUCTURE_TOWER, level: 5 },
                { dx: 0, dy: -1, structure: STRUCTURE_TOWER, level: 7 },
                { dx: -1, dy: 0, structure: STRUCTURE_TOWER, level: 8 },
                { dx: 1, dy: 0, structure: STRUCTURE_TOWER, level: 8 },
                { dx: 0, dy: 1, structure: STRUCTURE_TOWER, level: 8 },
                ...roads(5),
            ];
        case 'spawn':
            // Spawn 2 on top (RCL 7), spawn 3 below (RCL 8), nuker left and observer right (RCL 8).
            // The center is a road, so each spawn has road tiles next to it to spawn onto.
            return [
                { dx: 0, dy: -1, structure: STRUCTURE_SPAWN, level: 7 },
                { dx: 0, dy: 1, structure: STRUCTURE_SPAWN, level: 8 },
                options.powerSpawnInSpawnStamp
                    ? { dx: -1, dy: 0, structure: STRUCTURE_ROAD, level: 7 }
                    : { dx: -1, dy: 0, structure: STRUCTURE_NUKER, level: 8 },
                { dx: 1, dy: 0, structure: STRUCTURE_OBSERVER, level: 8 },
                options.powerSpawnInSpawnStamp
                    ? { dx: 0, dy: 0, structure: STRUCTURE_POWER_SPAWN, level: 8 }
                    : { dx: 0, dy: 0, structure: STRUCTURE_ROAD, level: 7 },
                ...roads(7),
            ];
    }
}

export interface StampAssignmentResult {
    /** What each found slot holds, by slot index. */
    readonly assignments: readonly StampAssignment[];
    /** Stamps that didn't fit (from the end of the order), for warnings. */
    readonly dropped: readonly StampAssignment[];
}

/**
 * Fills `slotCount` grid slots in STAMP_ORDER. `fixed` slots (ones with something built in them)
 * keep what they have, and each takes the matching entry out of the order; the rest of the order
 * fills the other slots. Stamps left over when the slots run out are dropped.
 */
export function assignStamps(slotCount: number, fixed: ReadonlyMap<number, StampAssignment> = new Map()): StampAssignmentResult {
    const remaining = [...STAMP_ORDER];
    for (const index of [...fixed.keys()].sort((a, b) => a - b)) {
        if (index >= slotCount) continue;
        const match = remaining.findIndex(a => sameAssignment(a, fixed.get(index)!));
        if (match >= 0) {
            remaining.splice(match, 1);
        }
    }
    const assignments: StampAssignment[] = [];
    for (let i = 0; i < slotCount; i++) {
        const kept = fixed.get(i);
        if (kept) {
            assignments.push(kept);
        } else if (remaining.length > 0) {
            assignments.push(remaining.shift()!);
        } else {
            break;
        }
    }
    return { assignments, dropped: remaining };
}

/**
 * The 10-lab stamp: a 4×4 square with a diagonal road. All labs touch the road, and the two input
 * labs (I) are within range 2 of the other eight.
 *
 * r L L .
 * L r I L
 * L I r L
 * . L L r
 *
 * Unlocked: the 2 inputs + 1 output at RCL 6, 3 more at RCL 7, the last 4 at RCL 8.
 */
export const LAB_STAMP: readonly StampTile[] = [
    { dx: 0, dy: 0, structure: STRUCTURE_ROAD, level: 6 },
    { dx: 1, dy: 1, structure: STRUCTURE_ROAD, level: 6 },
    { dx: 2, dy: 2, structure: STRUCTURE_ROAD, level: 6 },
    { dx: 3, dy: 3, structure: STRUCTURE_ROAD, level: 6 },
    // Inputs
    { dx: 2, dy: 1, structure: STRUCTURE_LAB, level: 6 },
    { dx: 1, dy: 2, structure: STRUCTURE_LAB, level: 6 },
    // Outputs
    { dx: 1, dy: 0, structure: STRUCTURE_LAB, level: 6 },
    { dx: 2, dy: 0, structure: STRUCTURE_LAB, level: 7 },
    { dx: 0, dy: 1, structure: STRUCTURE_LAB, level: 7 },
    { dx: 3, dy: 1, structure: STRUCTURE_LAB, level: 7 },
    { dx: 0, dy: 2, structure: STRUCTURE_LAB, level: 8 },
    { dx: 3, dy: 2, structure: STRUCTURE_LAB, level: 8 },
    { dx: 1, dy: 3, structure: STRUCTURE_LAB, level: 8 },
    { dx: 2, dy: 3, structure: STRUCTURE_LAB, level: 8 },
];

/** The lab stamp's input labs (offsets), which must be within range 2 of every other lab. */
export const LAB_INPUTS: readonly { dx: number, dy: number }[] = [{ dx: 2, dy: 1 }, { dx: 1, dy: 2 }];

/** The lab stamp's two road ends, which must join the base's roads. */
export const LAB_ROAD_ENDS: readonly { dx: number, dy: number }[] = [{ dx: 0, dy: 0 }, { dx: 3, dy: 3 }];

/** The lab stamp mirrored left to right (the road runs the other diagonal), for tighter rooms. */
export function mirroredLabStamp(): StampTile[] {
    return LAB_STAMP.map(t => ({ ...t, dx: 3 - t.dx }));
}
