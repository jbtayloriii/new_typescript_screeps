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

/** What a base's attackers mostly are, which decides the home defense squad's make-up. */
export type EnemyProfile = 'dismantlers' | 'melee' | 'ranged' | 'mixed';

/**
 * The roles of a squad defending its own base, countering the attackers:
 * - dismantlers (and claimers): all melee, no healer. They can't hit back, and melee does
 *   3× ranged damage;
 * - melee: ranged, which keeps range 3 and so takes no melee damage, plus a healer per 3;
 * - ranged: melee to close in for 3× damage, plus a healer per 3 for the damage on the way;
 * - mixed (or unknown): melee and ranged alternating, starting with melee, plus a healer per 3.
 */
export function homeDefenseComposition(size: number, enemy: EnemyProfile = 'mixed'): CombatRole[] {
    const n = Math.max(1, Math.min(MAX_SQUAD_SIZE, Math.floor(size)));
    if (enemy === 'dismantlers') {
        return Array<CombatRole>(n).fill('melee');
    }
    const healers = n >= 2 ? Math.max(1, Math.floor(n / 3)) : 0;
    const fighters = n - healers;
    const fighter = (i: number): CombatRole => enemy === 'melee' ? 'ranged' : enemy === 'ranged' ? 'melee' : i % 2 === 0 ? 'melee' : 'ranged';
    return [...Array.from({ length: fighters }, (_, i) => fighter(i)), ...Array<CombatRole>(healers).fill('healer')];
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
