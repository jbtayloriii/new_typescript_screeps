import { BodyPattern } from "tasks/types";

export function bodyCost(body: readonly BodyPartConstant[]): number {
    return body.reduce((cost, part) => cost + BODYPART_COST[part], 0);
}

/**
 * Repeats the pattern as many times as `energy` allows, up to its max repeats and the 50-part
 * limit. Returns null if not even one repeat is affordable.
 */
export function buildBody(body: BodyPattern, energy: number): BodyPartConstant[] | null {
    const patternCost = bodyCost(body.pattern);
    const repeats = Math.min(
        body.maxRepeats,
        Math.floor(energy / patternCost),
        Math.floor(MAX_CREEP_SIZE / body.pattern.length));
    if (repeats < 1) {
        return null;
    }
    const parts: BodyPartConstant[] = [];
    for (let i = 0; i < repeats; i++) {
        parts.push(...body.pattern);
    }
    return parts;
}
