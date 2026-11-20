import { IntentResult, IntentReturnCode } from "./types";

/**
 * Codes that are routine and not worth logging: a creep that's tired (fatigue) or still
 * spawning can't act this tick, but will on a later one.
 */
const IGNORED_CODES: ReadonlySet<IntentReturnCode> = new Set<IntentReturnCode>([OK, ERR_TIRED, ERR_BUSY]);

/**
 * Summarizes failed intents as "kind:code xN" counts (e.g. "harvest:-6 x2, move:-2"), or
 * returns null if nothing failed.
 */
export function summarizeFailures(results: readonly IntentResult[]): string | null {
    const counts = new Map<string, number>();
    for (const { intent, code } of results) {
        if (IGNORED_CODES.has(code)) {
            continue;
        }
        const key = `${intent.kind}:${code}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (counts.size === 0) {
        return null;
    }
    return [...counts].map(([key, count]) => count > 1 ? `${key} x${count}` : key).join(', ');
}
