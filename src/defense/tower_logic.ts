import { TowerIntent } from "intents/types";
import { findClosestByRange, getMyStructures } from "snapshot/queries";
import { RoomSnapshot, StructureSnapshot } from "snapshot/types";

/** Towers only repair structures at or below this many hits, leaving walls/ramparts to creeps. */
export const TOWER_REPAIR_HITS_CUTOFF = 10000;

/** Towers only repair structures missing at least this many hits, so repairs aren't wasted. */
export const TOWER_REPAIR_MIN_DAMAGE = 1000;

/**
 * Decides what each tower in the room does this tick: attack the closest hostile creep if there
 * is one, otherwise repair the closest damaged structure.
 */
export function decideTowerIntents(room: RoomSnapshot): TowerIntent[] {
    const intents: TowerIntent[] = [];
    const repairTargets = room.structures.filter(needsTowerRepair);

    for (const tower of getMyStructures(room, STRUCTURE_TOWER)) {
        if (!tower.store || tower.store.energy < TOWER_ENERGY_COST) {
            continue;
        }
        const towerId = tower.id as Id<StructureTower>;

        const hostile = findClosestByRange(tower.pos, room.hostileCreeps);
        if (hostile) {
            intents.push({ kind: 'towerAttack', towerId, targetId: hostile.id });
            continue;
        }

        const repairTarget = findClosestByRange(tower.pos, repairTargets);
        if (repairTarget) {
            intents.push({ kind: 'towerRepair', towerId, targetId: repairTarget.id });
        }
    }
    return intents;
}

function needsTowerRepair(structure: StructureSnapshot): boolean {
    return structure.owner !== 'other'
        && structure.hits <= structure.hitsMax - TOWER_REPAIR_MIN_DAMAGE
        && structure.hits <= TOWER_REPAIR_HITS_CUTOFF;
}
