import { Intent } from "intents/types";
import { findClosestByRange, getRange } from "snapshot/queries";
import { HostileCreepSnapshot, MyCreepSnapshot, Pos, RoomSnapshot, StructureSnapshot } from "snapshot/types";
import { isAttackableHostileStructure } from "intel/record_intel";

/**
 * Pure engagement logic: what to shoot, who to heal, and how each combat role acts and moves.
 */

export type CombatRole = 'melee' | 'ranged' | 'healer';

/** Which hostile structures a squad may target: none, only Invader cores (defense), or all (attack). */
export type StructureTargets = 'none' | 'invaderCores' | 'all';

export interface CombatTarget {
    readonly id: Id<Creep> | Id<Structure>;
    readonly pos: Pos;
    readonly kind: 'creep' | 'structure';
}

function parts(c: { activeParts: HostileCreepSnapshot['activeParts'] }, part: BodyPartConstant): number {
    return c.activeParts[part] ?? 0;
}

/** Hostile creeps in priority tiers: healers (they undo damage), ranged, melee, then the rest. */
const CREEP_TIERS: readonly ((h: HostileCreepSnapshot) => boolean)[] = [
    h => parts(h, HEAL) > 0,
    h => parts(h, RANGED_ATTACK) > 0,
    h => parts(h, ATTACK) > 0,
    () => true,
];

/** Hostile structures in priority tiers: cores and towers (they fight back), spawns, extensions, the rest. */
const STRUCTURE_TIERS: readonly StructureConstant[][] = [
    [STRUCTURE_INVADER_CORE, STRUCTURE_TOWER],
    [STRUCTURE_SPAWN],
    [STRUCTURE_EXTENSION],
];

/** Source Keepers guard their sources and respawn; leave them alone. */
function isTargetable(h: HostileCreepSnapshot): boolean {
    return h.owner !== 'Source Keeper';
}

/**
 * The target for a combat creep at `pos`: the closest hostile creep in the highest priority tier,
 * else the closest allowed hostile structure in the highest tier.
 */
export function chooseTarget(pos: Pos, room: RoomSnapshot, structures: StructureTargets): CombatTarget | null {
    const hostiles = room.hostileCreeps.filter(isTargetable);
    for (const tier of CREEP_TIERS) {
        const creep = findClosestByRange(pos, hostiles.filter(tier));
        if (creep) {
            return { id: creep.id, pos: creep.pos, kind: 'creep' };
        }
    }
    if (structures === 'none') {
        return null;
    }
    const candidates = room.structures.filter(s => isAttackableHostileStructure(s)
        && (structures === 'all' || s.structureType === STRUCTURE_INVADER_CORE));
    return chooseStructure(pos, candidates);
}

function chooseStructure(pos: Pos, structures: readonly StructureSnapshot[]): CombatTarget | null {
    for (const tier of STRUCTURE_TIERS) {
        const structure = findClosestByRange(pos, structures.filter(s => tier.includes(s.structureType)));
        if (structure) {
            return { id: structure.id, pos: structure.pos, kind: 'structure' };
        }
    }
    const rest = findClosestByRange(pos, structures);
    return rest ? { id: rest.id, pos: rest.pos, kind: 'structure' } : null;
}

/** The squad member (or self) with the lowest health fraction, if anyone is damaged. */
export function chooseHealTarget(healer: MyCreepSnapshot, squad: readonly MyCreepSnapshot[]): MyCreepSnapshot | null {
    let best: MyCreepSnapshot | null = null;
    let bestRatio = 1;
    for (const member of squad) {
        if (member.spawning || member.pos.roomName !== healer.pos.roomName) {
            continue;
        }
        const ratio = member.hits / member.hitsMax;
        if (ratio < bestRatio) {
            best = member;
            bestRatio = ratio;
        }
    }
    return best;
}

/** Hostile creeps within this range of a ranged attacker trigger a mass attack when there are several. */
const MASS_ATTACK_MIN_TARGETS = 2;

/**
 * One combat creep's action and movement against a target this tick:
 * - melee: walk to the target and attack it;
 * - ranged: keep at range 3 and shoot; mass attack when several hostiles are within range 3, or one
 *   is right next to it;
 * - healer: heal the most damaged squad member (in range 1, else from range 3), and stay next to
 *   them, or next to `follow` if nobody needs healing.
 * Movement and the action are separate intents, so a creep can do both in one tick.
 */
export function decideCombat(
    creep: MyCreepSnapshot,
    role: CombatRole,
    target: CombatTarget | null,
    room: RoomSnapshot,
    squad: readonly MyCreepSnapshot[],
    follow: Pos | null): Intent[] {
    const intents: Intent[] = [];
    if (role === 'healer') {
        const patient = chooseHealTarget(creep, squad);
        if (patient) {
            const range = getRange(creep.pos, patient.pos);
            if (range <= 1) {
                intents.push({ kind: 'heal', creepName: creep.name, targetId: patient.id });
            } else if (range <= 3) {
                intents.push({ kind: 'rangedHeal', creepName: creep.name, targetId: patient.id });
            }
            if (range > 1) {
                intents.push({ kind: 'move', creepName: creep.name, target: patient.pos, range: 1 });
            }
        } else if (follow && getRange(creep.pos, follow) > 1) {
            intents.push({ kind: 'move', creepName: creep.name, target: follow, range: 1 });
        }
        return intents;
    }
    if (!target) {
        if (follow && getRange(creep.pos, follow) > 1) {
            intents.push({ kind: 'move', creepName: creep.name, target: follow, range: 1 });
        }
        return intents;
    }
    const range = getRange(creep.pos, target.pos);
    if (role === 'melee') {
        if (range <= 1) {
            intents.push({ kind: 'attack', creepName: creep.name, targetId: target.id });
        } else {
            intents.push({ kind: 'move', creepName: creep.name, target: target.pos, range: 1 });
        }
        return intents;
    }
    // Ranged
    const near = room.hostileCreeps.filter(h => isTargetable(h) && getRange(creep.pos, h.pos) <= 3);
    if (near.length >= MASS_ATTACK_MIN_TARGETS || near.some(h => getRange(creep.pos, h.pos) <= 1)) {
        intents.push({ kind: 'rangedMassAttack', creepName: creep.name });
    } else if (range <= 3) {
        intents.push({ kind: 'rangedAttack', creepName: creep.name, targetId: target.id });
    }
    if (range > 3) {
        intents.push({ kind: 'move', creepName: creep.name, target: target.pos, range: 3 });
    }
    return intents;
}

/** True if a room has hostile creeps that can fight (Source Keepers aside). */
export function hasHostileCombatCreeps(room: RoomSnapshot): boolean {
    return room.hostileCreeps.some(h => isTargetable(h) && parts(h, ATTACK) + parts(h, RANGED_ATTACK) + parts(h, HEAL) > 0);
}
