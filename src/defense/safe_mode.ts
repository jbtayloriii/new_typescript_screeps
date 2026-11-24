import { Intent } from "intents/types";
import { getMyStructures, getRange } from "snapshot/queries";
import { HostileCreepSnapshot, RoomSnapshot, StructureSnapshot } from "snapshot/types";

/**
 * When to spend safe mode. It's scarce: a 50,000-tick cooldown and one charge per RCL gained, so
 * it's kept for when the base is actually about to lose a spawn or tower. (W23S31 spent its
 * charge on three tiny harassers at RCL 3 and had none when a real siege came two days later.)
 */

/** Hostiles this close to a spawn or tower count as attacking it (they close the gap in a tick or two). */
export const ENGAGE_RANGE = 3;

/** Safe mode is used when a spawn or tower would be destroyed within this many ticks. */
export const BREAK_HORIZON_TICKS = 50;

/** A claimer this close to the controller can attack it next, which blocks safe mode for 1,000 ticks. */
export const CLAIMER_RANGE = 3;

/** The structures losing which loses the base. */
const CRITICAL: readonly StructureConstant[] = [STRUCTURE_SPAWN, STRUCTURE_TOWER];

function isHostilePlayerOrInvader(h: HostileCreepSnapshot): boolean {
    return h.owner !== 'Source Keeper';
}

function parts(h: HostileCreepSnapshot, part: BodyPartConstant): number {
    return h.activeParts[part] ?? 0;
}

/** Damage per tick a creep can do to a structure: attack, ranged attack and dismantle (unboosted). */
export function structureDamagePerTick(h: HostileCreepSnapshot): number {
    return parts(h, ATTACK) * ATTACK_POWER + parts(h, RANGED_ATTACK) * RANGED_ATTACK_POWER + parts(h, WORK) * DISMANTLE_POWER;
}

/** A tower's damage at a range: full up to TOWER_OPTIMAL_RANGE, falling to 25% at TOWER_FALLOFF_RANGE. */
export function towerDamageAt(range: number): number {
    const r = Math.max(TOWER_OPTIMAL_RANGE, Math.min(TOWER_FALLOFF_RANGE, range));
    const falloff = (r - TOWER_OPTIMAL_RANGE) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE);
    return TOWER_POWER_ATTACK * (1 - TOWER_FALLOFF * falloff);
}

/**
 * Why the base needs safe mode right now, or null if it doesn't. Unboosted bodies are assumed
 * (boosts make attackers stronger, so this errs late against boosted ones).
 *
 * 1. For each spawn and tower: the hostiles within ENGAGE_RANGE could destroy it, and the rampart
 *    over it, within BREAK_HORIZON_TICKS; and the towers (minus all hostile healing) can't kill
 *    those hostiles before that.
 * 2. A claimer next to the controller while hostiles that can damage structures are in the
 *    room: once it attacks the controller, safe mode can't be activated for 1,000 ticks.
 *    A claimer on its own is left alone.
 */
export function assessBaseThreat(room: RoomSnapshot): string | null {
    const controller = room.controller;
    if (!controller?.my) {
        return null;
    }
    const hostiles = room.hostileCreeps.filter(isHostilePlayerOrInvader);
    const damaging = hostiles.filter(h => structureDamagePerTick(h) > 0);
    if (damaging.length === 0) {
        return null;
    }

    const towers = getMyStructures(room, STRUCTURE_TOWER).filter(t => (t.store?.energy ?? 0) >= TOWER_ENERGY_COST);
    const healing = hostiles.reduce((sum, h) => sum + parts(h, HEAL) * HEAL_POWER, 0);
    const rampartHits = (s: StructureSnapshot) => room.structures
        .filter(r => r.structureType === STRUCTURE_RAMPART && r.owner === 'me' && r.pos.x === s.pos.x && r.pos.y === s.pos.y)
        .reduce((sum, r) => sum + r.hits, 0);

    for (const target of room.structures.filter(s => s.owner === 'me' && CRITICAL.includes(s.structureType))) {
        const attackers = damaging.filter(h => getRange(h.pos, target.pos) <= ENGAGE_RANGE);
        const damage = attackers.reduce((sum, h) => sum + structureDamagePerTick(h), 0);
        if (damage === 0) continue;
        const breakTicks = (target.hits + rampartHits(target)) / damage;
        if (breakTicks > BREAK_HORIZON_TICKS) continue;

        const towerDamage = towers.reduce((sum, t) =>
            sum + towerDamageAt(Math.min(...attackers.map(h => getRange(t.pos, h.pos)))), 0);
        const net = towerDamage - healing;
        const killTicks = net > 0 ? attackers.reduce((sum, h) => sum + h.hits, 0) / net : Infinity;
        if (killTicks <= breakTicks) continue;

        const owners = [...new Set(attackers.map(h => h.owner))].join(', ');
        const kill = killTicks === Infinity ? 'towers can\'t out-damage their healing' : `towers need ~${Math.ceil(killTicks)} ticks to kill them`;
        return `${attackers.length} hostile${attackers.length > 1 ? 's' : ''} (${owners}) can destroy the ${target.structureType} at `
            + `${target.pos.x},${target.pos.y} in ~${Math.ceil(breakTicks)} ticks; ${kill}`;
    }

    const claimer = hostiles.find(h => parts(h, CLAIM) > 0 && getRange(h.pos, controller.pos) <= CLAIMER_RANGE);
    if (claimer) {
        return `claimer ${claimer.name} (${claimer.owner}) at the controller would block safe mode, with ${damaging.length} `
            + `hostile${damaging.length > 1 ? 's' : ''} that can damage structures in the room`;
    }
    return null;
}

/** Activates safe mode when `assessBaseThreat` finds a reason and safe mode can be used. */
export function decideSafeMode(room: RoomSnapshot): Intent[] {
    const controller = room.controller;
    if (!controller?.my || controller.safeMode || controller.safeModeCooldown || controller.safeModeAvailable <= 0) {
        return [];
    }
    const reason = assessBaseThreat(room);
    return reason ? [{ kind: 'activateSafeMode', controllerId: controller.id, reason }] : [];
}
