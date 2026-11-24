import { towerDamageAt } from "defense/safe_mode";
import { getMyStructures, getRange } from "snapshot/queries";
import { HostileCreepSnapshot, RoomSnapshot } from "snapshot/types";
import { ThreatParts } from "directives/types";
import { EnemyProfile, SQUAD_BODIES } from "./squads";

/**
 * Automatic defense of a base's own room against other players (see docs/TODO.md and the W23S31
 * loss: five waves of dismantlers in 12 hours, while the base kept spawning remote miners).
 *
 * When player creeps that can do damage are in the base room and the towers can't kill them
 * quickly, the empire planner creates a `defend` directive for the base room itself. Its squad
 * spawns ahead of everything but the base's core economy (HOME_DEFENSE_PRIORITY), fights as soon
 * as each member spawns, and is recycled once the room has been clear for a while.
 */

/**
 * Spawn priority for home defenders: above upgraders, builders, repairers, remotes and extra
 * haulers; below the first miner, harvesters and the first hauler, so energy keeps coming in.
 * A defender waiting for energy holds back everything below it (see `planSpawnQueue`).
 */
export const HOME_DEFENSE_PRIORITY = 95;

/** Towers that can kill every attacker within this many ticks are left to handle it alone. */
export const HOME_DEFENSE_TOWER_TICKS = 50;

export const MIN_HOME_DEFENSE_SIZE = 2;
export const MAX_HOME_DEFENSE_SIZE = 6;

/** After a home defense is cancelled from the console, don't create another for this long. */
export const HOME_DEFENSE_CANCEL_COOLDOWN = 1500;

/** NPC owners: towers handle invaders, and source keepers don't attack bases. */
const NPC_OWNERS: ReadonlySet<string> = new Set(['Invader', 'Source Keeper']);

function parts(h: HostileCreepSnapshot, part: BodyPartConstant): number {
    return h.activeParts[part] ?? 0;
}

/** Other players' creeps in a room. */
export function playerHostiles(room: RoomSnapshot): HostileCreepSnapshot[] {
    return room.hostileCreeps.filter(h => !NPC_OWNERS.has(h.owner));
}

/**
 * Other players' creeps that threaten a base: anything that can attack, dismantle (WORK) or
 * attack the controller (CLAIM). Healers and scouts on their own aren't threats.
 */
export function homeThreats(room: RoomSnapshot): HostileCreepSnapshot[] {
    return playerHostiles(room).filter(h =>
        parts(h, ATTACK) + parts(h, RANGED_ATTACK) + parts(h, WORK) + parts(h, CLAIM) > 0);
}

/** The attackers (see `homeThreats`) plus any player healers with them, or none if there are no attackers. */
export function attackingHostiles(room: RoomSnapshot): HostileCreepSnapshot[] {
    const threats = homeThreats(room);
    return threats.length === 0 ? [] : playerHostiles(room).filter(h => threats.includes(h) || parts(h, HEAL) > 0);
}

/**
 * Ticks the room's towers need to kill every player hostile (threats and the healers with them),
 * or Infinity if they can't out-damage the healing. Each tower is assumed to fire at the hostile
 * closest to it, at that range's damage.
 */
export function towerKillTicks(room: RoomSnapshot, hostiles: readonly HostileCreepSnapshot[]): number {
    if (hostiles.length === 0) return 0;
    const towers = getMyStructures(room, STRUCTURE_TOWER).filter(t => (t.store?.energy ?? 0) >= TOWER_ENERGY_COST);
    const damage = towers.reduce((sum, t) => sum + towerDamageAt(Math.min(...hostiles.map(h => getRange(t.pos, h.pos)))), 0);
    const healing = hostiles.reduce((sum, h) => sum + parts(h, HEAL) * HEAL_POWER, 0);
    const net = damage - healing;
    return net > 0 ? hostiles.reduce((sum, h) => sum + h.hits, 0) / net : Infinity;
}

/**
 * How many defenders to send: the attackers' combat parts (attack, ranged attack, work, heal)
 * over the combat parts one defender gets at the base's energy capacity, plus one, between
 * MIN_HOME_DEFENSE_SIZE and MAX_HOME_DEFENSE_SIZE.
 */
export function homeDefenseSize(hostiles: readonly HostileCreepSnapshot[], energyCapacity: number): number {
    const theirs = hostiles.reduce((sum, h) => sum + parts(h, ATTACK) + parts(h, RANGED_ATTACK) + parts(h, WORK) + parts(h, HEAL), 0);
    const melee = SQUAD_BODIES.melee;
    const patternCost = melee.pattern.reduce((sum, p) => sum + BODYPART_COST[p], 0);
    const ours = Math.max(1, Math.min(melee.maxRepeats, Math.floor(energyCapacity / patternCost)));
    return Math.max(MIN_HOME_DEFENSE_SIZE, Math.min(MAX_HOME_DEFENSE_SIZE, Math.ceil(theirs / ours) + 1));
}

/** The combat parts on a group of hostiles. */
export function threatParts(hostiles: readonly HostileCreepSnapshot[]): ThreatParts {
    const sum = (part: BodyPartConstant) => hostiles.reduce((total, h) => total + parts(h, part), 0);
    return { attack: sum(ATTACK), ranged: sum(RANGED_ATTACK), work: sum(WORK), heal: sum(HEAL) };
}

/** The larger of each part count, so a defense remembers the strongest threat it has seen. */
export function maxThreat(a: ThreatParts | undefined, b: ThreatParts): ThreatParts {
    if (!a) return b;
    return {
        attack: Math.max(a.attack, b.attack), ranged: Math.max(a.ranged, b.ranged),
        work: Math.max(a.work, b.work), heal: Math.max(a.heal, b.heal),
    };
}

/**
 * What the attackers mostly are: dismantlers (no attack or ranged attack parts at all), melee or
 * ranged (at least twice as many of those parts as the other), else mixed.
 */
export function enemyProfile(threat: ThreatParts): EnemyProfile {
    if (threat.attack + threat.ranged === 0) return 'dismantlers';
    if (threat.attack >= 2 * threat.ranged) return 'melee';
    if (threat.ranged >= 2 * threat.attack) return 'ranged';
    return 'mixed';
}

/**
 * Whether a base room needs defenders now, how many, and what the attackers are: player threats
 * are present and the towers can't kill them all within HOME_DEFENSE_TOWER_TICKS. Returns null if
 * it doesn't.
 */
export function homeDefenseNeed(room: RoomSnapshot, energyCapacity: number): { size: number, threat: ThreatParts, reason: string } | null {
    const threats = homeThreats(room);
    if (threats.length === 0) {
        return null;
    }
    const hostiles = attackingHostiles(room);
    const killTicks = towerKillTicks(room, hostiles);
    if (killTicks <= HOME_DEFENSE_TOWER_TICKS) {
        return null;
    }
    const owners = [...new Set(threats.map(h => h.owner))].join(', ');
    const towers = killTicks === Infinity ? 'no tower can out-damage them' : `towers need ~${Math.ceil(killTicks)} ticks`;
    const threat = threatParts(hostiles);
    return {
        size: homeDefenseSize(hostiles, energyCapacity),
        threat,
        reason: `${threats.length} attacker${threats.length > 1 ? 's' : ''} (${owners}; ${enemyProfile(threat)}); ${towers}`,
    };
}
