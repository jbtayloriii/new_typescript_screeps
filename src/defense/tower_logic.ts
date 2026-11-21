import { TowerIntent } from "intents/types";
import { findClosestByRange, getMyStructures } from "snapshot/queries";
import { HostileCreepSnapshot, RoomSnapshot, StructureSnapshot } from "snapshot/types";
import { needsRepair } from "./repair_targets";

/** Towers only repair structures missing at least this many hits, so repairs aren't wasted. */
export const TOWER_REPAIR_MIN_DAMAGE = 1000;

/** Towers keep this much energy for defense and only repair above it. */
export const TOWER_REPAIR_MIN_ENERGY = 500;

function isWall(s: StructureSnapshot): boolean {
    return s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART;
}

function parts(creep: HostileCreepSnapshot, part: BodyPartConstant): number {
    return creep.activeParts[part] ?? 0;
}

/**
 * Picks a tower's target: the closest healer first (healers undo tower damage), then the closest
 * creep that can attack, then the closest hostile.
 */
export function chooseTowerTarget(tower: StructureSnapshot, hostiles: readonly HostileCreepSnapshot[]): HostileCreepSnapshot | null {
    return findClosestByRange(tower.pos, hostiles.filter(h => parts(h, HEAL) > 0))
        ?? findClosestByRange(tower.pos, hostiles.filter(h => parts(h, ATTACK) + parts(h, RANGED_ATTACK) > 0))
        ?? findClosestByRange(tower.pos, hostiles);
}

/**
 * Decides what each tower does this tick, in order:
 * 1. Attack (see `chooseTowerTarget`).
 * 2. Heal the closest damaged creep of mine.
 * 3. If it has energy to spare: repair the closest damaged non-wall structure, then the weakest
 *    wall or rampart below its RCL target.
 */
export function decideTowerIntents(room: RoomSnapshot): TowerIntent[] {
    const intents: TowerIntent[] = [];
    const rcl = room.controller?.level ?? 0;
    const damagedCreeps = room.creepsPresent.filter(c => c.hits < c.hitsMax);
    const repairTargets = room.structures.filter(s => needsRepair(s, rcl));
    const structures = repairTargets.filter(s => !isWall(s) && s.hitsMax - s.hits >= TOWER_REPAIR_MIN_DAMAGE);
    const weakestWall = repairTargets.filter(isWall)
        .reduce<StructureSnapshot | null>((weakest, s) => !weakest || s.hits < weakest.hits ? s : weakest, null);

    for (const tower of getMyStructures(room, STRUCTURE_TOWER)) {
        const energy = tower.store?.energy ?? 0;
        if (energy < TOWER_ENERGY_COST) {
            continue;
        }
        const towerId = tower.id as Id<StructureTower>;

        const hostile = chooseTowerTarget(tower, room.hostileCreeps);
        if (hostile) {
            intents.push({ kind: 'towerAttack', towerId, targetId: hostile.id });
            continue;
        }
        const patient = findClosestByRange(tower.pos, damagedCreeps);
        if (patient) {
            intents.push({ kind: 'towerHeal', towerId, targetId: patient.id });
            continue;
        }
        if (energy < TOWER_REPAIR_MIN_ENERGY) {
            continue;
        }
        const repairTarget = findClosestByRange(tower.pos, structures) ?? weakestWall;
        if (repairTarget) {
            intents.push({ kind: 'towerRepair', towerId, targetId: repairTarget.id });
        }
    }
    return intents;
}
