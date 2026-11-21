import { Intent } from "intents/types";
import { getMyStructures, getRange } from "snapshot/queries";
import { HostileCreepSnapshot, RoomSnapshot } from "snapshot/types";

/** Hostiles this close to a spawn (or THREAT_RANGE_CONTROLLER to the controller) threaten the base. */
export const THREAT_RANGE_SPAWN = 5;
export const THREAT_RANGE_CONTROLLER = 3;

/** Lowest tower damage per shot (at range 20+), used to judge whether towers out-damage healing. */
const MIN_TOWER_DAMAGE = TOWER_POWER_ATTACK * (1 - TOWER_FALLOFF);

function isDangerous(h: HostileCreepSnapshot): boolean {
    if (h.owner === 'Source Keeper') {
        return false;
    }
    const p = h.activeParts;
    return (p[ATTACK] ?? 0) + (p[RANGED_ATTACK] ?? 0) + (p[WORK] ?? 0) + (p[CLAIM] ?? 0) > 0;
}

/**
 * Activates safe mode when dangerous hostiles are next to a spawn or the controller and the
 * towers can't cope: no tower has energy, the attackers heal faster than the towers' minimum
 * damage, or a spawn is already damaged.
 */
export function decideSafeMode(room: RoomSnapshot): Intent[] {
    const controller = room.controller;
    if (!controller?.my || controller.safeMode || controller.safeModeCooldown || controller.safeModeAvailable <= 0) {
        return [];
    }
    const spawns = getMyStructures(room, STRUCTURE_SPAWN);
    const threats = room.hostileCreeps.filter(h => isDangerous(h) && (
        spawns.some(s => getRange(h.pos, s.pos) <= THREAT_RANGE_SPAWN)
        || getRange(h.pos, controller.pos) <= THREAT_RANGE_CONTROLLER));
    if (threats.length === 0) {
        return [];
    }

    const towers = getMyStructures(room, STRUCTURE_TOWER).filter(t => (t.store?.energy ?? 0) >= TOWER_ENERGY_COST);
    const healing = threats.reduce((sum, h) => sum + (h.activeParts[HEAL] ?? 0) * HEAL_POWER, 0);
    const towersCanCope = towers.length > 0 && towers.length * MIN_TOWER_DAMAGE > healing;
    const spawnDamaged = spawns.some(s => s.hits < s.hitsMax);

    if (towersCanCope && !spawnDamaged) {
        return [];
    }
    return [{ kind: 'activateSafeMode', controllerId: controller.id }];
}
