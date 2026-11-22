import { BodyPattern } from "tasks/types";
import { CombatRole } from "./combat";

/** The jobs a squad is sent to do (one per military directive type). */
export type Mission = 'attack' | 'defend' | 'escort';

export const SQUAD_BODIES: Record<CombatRole, BodyPattern> = {
    melee: { pattern: [ATTACK, MOVE], maxRepeats: 10 },
    ranged: { pattern: [RANGED_ATTACK, MOVE], maxRepeats: 8 },
    healer: { pattern: [HEAL, MOVE], maxRepeats: 6 },
};

/** Spawn priority by mission: defending a remote beats escorting, which beats attacking. */
export const MISSION_PRIORITY: Record<Mission, number> = {
    defend: 70,
    escort: 45,
    attack: 20,
};

export const DEFAULT_SQUAD_SIZE: Record<Mission, number> = {
    defend: 2,
    escort: 2,
    attack: 4,
};

export const MAX_SQUAD_SIZE = 8;

/**
 * The roles in a squad of `size`:
 * - attack: one healer per 3 members (at least one once there are 2), the rest alternating melee
 *   and ranged, starting with melee;
 * - defend and escort: ranged (they can also hit structures like Invader cores), with a healer
 *   once there are 2.
 */
export function squadComposition(mission: Mission, size: number): CombatRole[] {
    const n = Math.max(1, Math.min(MAX_SQUAD_SIZE, Math.floor(size)));
    if (mission === 'attack') {
        const healers = n >= 2 ? Math.max(1, Math.floor(n / 3)) : 0;
        const fighters: CombatRole[] = Array.from({ length: n - healers }, (_, i) => i % 2 === 0 ? 'melee' : 'ranged');
        return [...fighters, ...Array<CombatRole>(healers).fill('healer')];
    }
    const healers = n >= 2 ? 1 : 0;
    return [...Array<CombatRole>(n - healers).fill('ranged'), ...Array<CombatRole>(healers).fill('healer')];
}

/** Squad states, saved in each member's `memory.state`. */
export const enum SquadState {
    RALLY = 0,
    ENGAGE = 1,
    RETREAT = 2,
}

/** Below this fraction of total hits the squad retreats; it re-engages above RETREAT_RECOVER. */
export const RETREAT_BELOW = 0.4;
export const RETREAT_RECOVER = 0.9;
