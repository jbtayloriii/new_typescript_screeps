import { BodyPattern } from "tasks/types";

export function bodyCost(body: readonly BodyPartConstant[]): number {
    return body.reduce((cost, part) => cost + BODYPART_COST[part], 0);
}

/**
 * Builds a body: the base parts once, then the pattern repeated as many times as `energy`
 * allows, up to its max repeats and the 50-part limit. Returns null if the base isn't
 * affordable, or (without a base) not even one repeat is.
 */
export function buildBody(body: BodyPattern, energy: number): BodyPartConstant[] | null {
    const base = body.base ?? [];
    const baseCost = bodyCost(base);
    if (baseCost > energy) {
        return null;
    }
    let repeats = 0;
    if (body.pattern.length > 0) {
        repeats = Math.min(
            body.maxRepeats,
            Math.floor((energy - baseCost) / bodyCost(body.pattern)),
            Math.floor((MAX_CREEP_SIZE - base.length) / body.pattern.length));
    }
    if (base.length === 0 && repeats < 1) {
        return null;
    }
    const parts: BodyPartConstant[] = [...base];
    for (let i = 0; i < repeats; i++) {
        parts.push(...body.pattern);
    }
    return parts;
}

/** The smallest body a pattern allows: the base, or one repeat if there's no base. */
export function minimalBody(body: BodyPattern): readonly BodyPartConstant[] {
    return body.base && body.base.length > 0 ? body.base : body.pattern;
}

/** Ticks a spawn takes to spawn a body. */
export function spawnTicks(parts: number): number {
    return parts * CREEP_SPAWN_TIME;
}

/**
 * Ticks per tile for a fully loaded creep on plains without roads: each non-MOVE part adds 2
 * fatigue per move, and each MOVE part removes 2 per tick.
 */
export function ticksPerTile(activeParts: Readonly<Partial<Record<BodyPartConstant, number>>>): number {
    const move = activeParts[MOVE] ?? 0;
    const other = Object.entries(activeParts)
        .filter(([part]) => part !== MOVE)
        .reduce((sum, [, count]) => sum + (count ?? 0), 0);
    if (move === 0) {
        return Infinity;
    }
    return Math.max(1, Math.ceil(other / move));
}

/** Counts parts by type. */
export function countParts(parts: readonly BodyPartConstant[]): Partial<Record<BodyPartConstant, number>> {
    const counts: Partial<Record<BodyPartConstant, number>> = {};
    for (const part of parts) {
        counts[part] = (counts[part] ?? 0) + 1;
    }
    return counts;
}
