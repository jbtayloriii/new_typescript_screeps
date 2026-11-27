import { TowerIntent } from "intents/types";
import { findClosestByRange, getMyStructures } from "snapshot/queries";
import { HostileCreepSnapshot, RoomSnapshot, StructureSnapshot } from "snapshot/types";
import { needsRepair } from "./repair_targets";

/** Towers only repair structures missing at least this many hits, so repairs aren't wasted. */
export const TOWER_REPAIR_MIN_DAMAGE = 1000;

/** Towers keep this much energy for defense and only repair above it. */
export const TOWER_REPAIR_MIN_ENERGY = 500;

/**
 * Ramparts below this many hits are repaired whenever a tower has the energy for a shot, ahead of
 * other repairs. A new rampart has 1 hit and loses RAMPART_DECAY_AMOUNT (300) every 100 ticks, so
 * without this it can decay away before a tower has energy to spare.
 */
export const RAMPART_RESCUE_HITS = 2 * RAMPART_DECAY_AMOUNT;

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
 * 3. Repair the weakest rampart about to decay away (below RAMPART_RESCUE_HITS).
 * 4. If it has energy to spare: repair the closest damaged non-wall structure, then the weakest
 *    wall or rampart below its RCL target. Only walls in `plannedWalls` (the base layout's, see
 *    `plannedWallTiles`) are repaired.
 */
export function decideTowerIntents(room: RoomSnapshot, plannedWalls: ReadonlySet<string>): TowerIntent[] {
    const intents: TowerIntent[] = [];
    const rcl = room.controller?.level ?? 0;
    const damagedCreeps = room.creepsPresent.filter(c => c.hits < c.hitsMax);
    const repairTargets = room.structures.filter(s => needsRepair(s, rcl, plannedWalls));
    const structures = repairTargets.filter(s => !isWall(s) && s.hitsMax - s.hits >= TOWER_REPAIR_MIN_DAMAGE);
    const weakest = (list: readonly StructureSnapshot[]) =>
        list.reduce<StructureSnapshot | null>((w, s) => !w || s.hits < w.hits ? s : w, null);
    const weakestWall = weakest(repairTargets.filter(isWall));
    const dyingRampart = weakest(repairTargets.filter(s => s.structureType === STRUCTURE_RAMPART && s.hits < RAMPART_RESCUE_HITS));

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
        if (dyingRampart) {
            intents.push({ kind: 'towerRepair', towerId, targetId: dyingRampart.id });
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
