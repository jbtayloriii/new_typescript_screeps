import { IntelMap } from "intel/types";
import { Intent } from "intents/types";
import {
    attackingHostiles, HOME_DEFENSE_CANCEL_COOLDOWN, homeDefenseNeed, homeThreats, maxThreat, threatParts,
} from "military/home_defense";
import { WorldSnapshot } from "snapshot/world";
import { chooseNewRemoteRooms, remoteBlocker } from "tasks/remote_selection";
import { roomLinearDistance } from "utils/room_names";
import { parseFlag } from "./flags";
import { chooseSpawnPosition } from "./spawn_position";
import { Directive, DirectiveSpec, isEnded, isMilitary, ThreatParts } from "./types";

/** A base's state as directive planning needs it. */
export interface BaseSummary {
    readonly roomName: RoomName;
    readonly energyCapacity: number;
    /** True once the base runs mine tasks (static mining). */
    readonly staticMining: boolean;
}

export interface DirectivePlanInput {
    readonly world: WorldSnapshot;
    readonly directives: readonly Directive[];
    readonly bases: readonly BaseSummary[];
    readonly intel: IntelMap;
}

export interface DirectiveChanges {
    readonly create: readonly DirectiveSpec[];
    readonly update: readonly { readonly id: string; readonly patch: Partial<Directive> }[];
    readonly end: readonly { readonly id: string; readonly status: 'done' | 'cancelled'; readonly reason: string }[];
    readonly intents: readonly Intent[];
    /**
     * Creeps moving to another base (a finished claim's creeps join the new base). Applied before
     * creeps are grouped by base, so no base sees them as its own orphans this tick.
     */
    readonly handoffs: readonly { readonly creepName: string; readonly baseRoomName: RoomName }[];
}

/** Energy capacity a base needs to spawn a claimer ([CLAIM, MOVE]). */
export const CLAIM_MIN_CAPACITY = BODYPART_COST[CLAIM] + BODYPART_COST[MOVE];

/** Bases only take directives for rooms within this many rooms. */
export const MAX_DIRECTIVE_DISTANCE = 10;

/** Energy capacity a base needs to run a combat squad. */
export const MILITARY_MIN_CAPACITY = 550;

/** A defended room counts as safe once no hostiles have been seen there for this long. */
export const DEFEND_CLEAR_TICKS = 100;

/** Remote rooms get an automatic defend directive while NPC hostiles were seen this recently. */
export const AUTO_DEFEND_RECENT_TICKS = 300;

/** The NPC owner name of invaders (creeps and cores). */
const INVADER = 'Invader';

/**
 * The squad size for an automatic defense: one more than the hostile combat creeps (plus one for
 * a core), between 2 and 4.
 */
export function autoDefendSize(room: { hostileCombatCreeps: number, invaderCores?: number }): number {
    return Math.max(2, Math.min(4, room.hostileCombatCreeps + ((room.invaderCores ?? 0) > 0 ? 1 : 0) + 1));
}

/**
 * The empire-level step, run once per tick before the bases. All pure:
 * 1. Flags: new directive flags create directives; removed flags cancel theirs.
 * 2. Finish directives whose goal is met or impossible (and remove their flags).
 * 3. Assign pending directives to the closest suitable base.
 * 4. Claims: pick a spawn position once the room's intel exists.
 * 5. Automatic remote mining: each static base gets remote rooms up to its limit.
 * 6. Automatic defense: a remote room with NPC invaders (creeps or a core) gets a defend directive
 *    from its base. Player hostiles in remotes are left to manual orders (`cmd.defend`), since
 *    auto-sending squads at players could start fights the base can't win.
 * 7. Home defense: a base room with player attackers its towers can't kill quickly gets a defend
 *    directive for itself (see `military/home_defense.ts`), whose squad spawns ahead of most of
 *    the economy. While attackers are there, it records when they were last seen and grows (never
 *    shrinks) to the threat.
 */
export function planDirectives(input: DirectivePlanInput): DirectiveChanges {
    const { world, intel } = input;
    const create: DirectiveSpec[] = [];
    const update: { id: string, patch: Partial<Directive> }[] = [];
    const end: { id: string, status: 'done' | 'cancelled', reason: string }[] = [];
    const intents: Intent[] = [];
    const handoffs: { creepName: string, baseRoomName: RoomName }[] = [];
    const live = input.directives.filter(d => !isEnded(d));

    // 1. Flags.
    const flagNames = new Set(world.flags.map(f => f.name));
    for (const flag of world.flags) {
        const spec = parseFlag(flag);
        if (spec && !input.directives.some(d => d.flagName === flag.name)) {
            create.push(spec);
        }
    }
    for (const d of live) {
        if (d.source === 'flag' && d.flagName && !flagNames.has(d.flagName)) {
            end.push({ id: d.id, status: 'cancelled', reason: 'flag removed' });
        }
    }

    // 2. Finish directives.
    const ending = new Set(end.map(e => e.id));
    for (const d of live) {
        if (ending.has(d.id)) {
            continue;
        }
        const reason = finishedReason(d, input);
        if (reason) {
            end.push({ id: d.id, status: 'done', reason });
            ending.add(d.id);
            if (d.flagName && flagNames.has(d.flagName)) {
                intents.push({ kind: 'removeFlag', flagName: d.flagName });
            }
            if (d.type === 'claim' && input.bases.some(b => b.roomName === d.targetRoom)) {
                for (const creep of world.myCreeps) {
                    const role = creep.memory.role;
                    if (creep.pos.roomName === d.targetRoom && creep.memory.baseRoomName === d.baseRoomName
                        && (role === 'pioneer' || role === 'claimer')) {
                        handoffs.push({ creepName: creep.name, baseRoomName: d.targetRoom });
                    }
                }
            }
        }
    }

    // 3 & 4. Assign bases and claim spawn positions.
    for (const d of live) {
        if (ending.has(d.id)) {
            continue;
        }
        if (d.status === 'pending') {
            const assignment = assignBase(d, input);
            if ('baseRoomName' in assignment) {
                update.push({ id: d.id, patch: { status: 'active', baseRoomName: assignment.baseRoomName, reason: undefined } });
            } else if (d.reason !== assignment.waiting) {
                update.push({ id: d.id, patch: { reason: assignment.waiting } });
            }
        }
        if (d.type === 'claim' && !d.spawnPos && intel[d.targetRoom]) {
            const room = intel[d.targetRoom];
            const spawnPos = chooseSpawnPosition(world.getTerrain(d.targetRoom), room.sources, room.controller);
            if (spawnPos) {
                update.push({ id: d.id, patch: { spawnPos } });
            }
        }
    }

    // 5. Automatic remote mining.
    const remoteRooms = (filter: (d: Directive) => boolean) =>
        live.filter(d => d.type === 'remoteMine' && !ending.has(d.id) && filter(d)).map(d => d.targetRoom);
    const cancelled = input.directives.filter(d => d.status === 'cancelled').map(d => d.targetRoom);
    const baseRooms = input.bases.map(b => b.roomName);
    for (const base of input.bases) {
        if (!base.staticMining) {
            continue;
        }
        const current = remoteRooms(d => d.baseRoomName === base.roomName);
        const unavailable = [
            ...baseRooms,
            ...cancelled,
            ...remoteRooms(d => d.baseRoomName !== base.roomName),
            ...create.filter(c => c.type === 'remoteMine').map(c => c.targetRoom),
        ];
        for (const targetRoom of chooseNewRemoteRooms({
            energyCapacity: base.energyCapacity,
            neighbors: world.getExits(base.roomName),
            intel,
            myUsername: world.myUsername,
            tick: world.tick,
            current,
            unavailable,
        })) {
            create.push({ type: 'remoteMine', targetRoom, source: 'auto', baseRoomName: base.roomName });
        }
    }

    // 6. Automatic defense of remote rooms against NPC invaders.
    const defended = new Set(live.filter(d => d.type === 'defend' && !ending.has(d.id)).map(d => d.targetRoom));
    const defendCancelled = new Set(input.directives.filter(d => d.type === 'defend' && d.status === 'cancelled').map(d => d.targetRoom));
    for (const d of live) {
        const room = intel[d.targetRoom];
        const base = input.bases.find(b => b.roomName === d.baseRoomName);
        if (d.type !== 'remoteMine' || ending.has(d.id) || !room || !base || base.energyCapacity < MILITARY_MIN_CAPACITY
            || defended.has(d.targetRoom) || defendCancelled.has(d.targetRoom)) {
            continue;
        }
        const recent = room.hostilesLastSeen !== undefined && world.tick - room.hostilesLastSeen < AUTO_DEFEND_RECENT_TICKS;
        const npcOnly = (room.hostileOwners ?? []).every(owner => owner === INVADER);
        const invaders = recent && room.hostileCombatCreeps > 0 && npcOnly;
        if (invaders || (room.invaderCores ?? 0) > 0) {
            create.push({ type: 'defend', targetRoom: d.targetRoom, source: 'auto', baseRoomName: base.roomName, size: autoDefendSize(room) });
            defended.add(d.targetRoom);
        }
    }

    // 7. Home defense against players.
    for (const base of input.bases) {
        const room = world.getRoom(base.roomName);
        if (!room) {
            continue;
        }
        const existing = live.find(d => d.type === 'defend' && d.targetRoom === base.roomName && !ending.has(d.id));
        const need = homeDefenseNeed(room, base.energyCapacity);
        if (existing) {
            // Keep the threat clock running while any attacker is here, even ones the towers could
            // handle, and remember the strongest threat so the squad's make-up doesn't flip as
            // attackers die.
            const patch: { lastThreatAt?: number, size?: number, threat?: ThreatParts } = {};
            const attackers = attackingHostiles(room);
            if (attackers.length > 0) {
                patch.lastThreatAt = world.tick;
                const threat = maxThreat(existing.threat, threatParts(attackers));
                if (JSON.stringify(threat) !== JSON.stringify(existing.threat)) patch.threat = threat;
            }
            if (need && need.size > (existing.size ?? 0)) patch.size = need.size;
            if (Object.keys(patch).length > 0) update.push({ id: existing.id, patch });
            continue;
        }
        const recentlyCancelled = input.directives.some(d => d.type === 'defend' && d.targetRoom === base.roomName
            && d.status === 'cancelled' && world.tick - (d.endedAt ?? 0) < HOME_DEFENSE_CANCEL_COOLDOWN);
        if (need && !recentlyCancelled) {
            create.push({
                type: 'defend', targetRoom: base.roomName, source: 'auto', baseRoomName: base.roomName,
                size: need.size, lastThreatAt: world.tick, threat: need.threat, reason: `under attack: ${need.reason}`,
            });
        }
    }

    return { create, update, end, intents, handoffs };
}

/** Why a directive is finished (met or impossible), or null if it should keep going. */
function finishedReason(d: Directive, input: DirectivePlanInput): string | null {
    const { world, intel } = input;
    const room = intel[d.targetRoom];
    switch (d.type) {
        case 'scout':
            return room && room.lastSeen >= d.createdAt ? 'scouted' : null;
        case 'remoteMine': {
            if (input.bases.some(b => b.roomName === d.targetRoom)) {
                return 'room is now a base';
            }
            const blocker = room ? remoteBlocker(room, world.myUsername) : null;
            return blocker && blocker !== 'no intel' ? `can't remote mine: ${blocker}` : null;
        }
        case 'claim': {
            if (input.bases.some(b => b.roomName === d.targetRoom)) {
                return 'claimed: base created';
            }
            const owner = room?.controller?.owner;
            if (owner && owner !== world.myUsername) {
                return `owned by ${owner}`;
            }
            if (room && !room.controller) {
                return 'room has no controller';
            }
            return null;
        }
        case 'attack': {
            const cleared = room && room.lastSeen >= d.createdAt
                && (room.hostileStructures ?? 0) === 0 && room.hostileCombatCreeps === 0;
            return cleared ? 'target cleared' : null;
        }
        case 'defend': {
            // A base's own room is always visible, so use what's there now.
            const home = input.bases.some(b => b.roomName === d.targetRoom) ? world.getRoom(d.targetRoom) : undefined;
            if (home) {
                const quiet = homeThreats(home).length === 0 && world.tick - (d.lastThreatAt ?? d.createdAt) >= DEFEND_CLEAR_TICKS;
                return quiet ? 'base clear' : null;
            }
            if (!room || room.lastSeen < d.createdAt) {
                return null;
            }
            const quietFor = world.tick - Math.max(room.hostilesLastSeen ?? d.createdAt, d.createdAt);
            const clear = room.hostileCombatCreeps === 0 && (room.invaderCores ?? 0) === 0 && quietFor >= DEFEND_CLEAR_TICKS;
            return clear ? 'room clear' : null;
        }
        case 'escort': {
            const escorted = input.directives.find(e => e.id === d.escortedId);
            return !escorted || isEnded(escorted) ? 'escorted directive ended' : null;
        }
    }
}

/** The closest base that can run the directive, or why it has to wait. */
function assignBase(d: Directive, input: DirectivePlanInput): { baseRoomName: RoomName } | { waiting: string } {
    if (d.type === 'claim' && input.world.gclLevel <= input.world.ownedRooms.length) {
        return { waiting: `GCL ${input.world.gclLevel} is too low to claim another room` };
    }
    if (d.type === 'escort') {
        // Escorts run from the escorted directive's base, so the squad can find its creeps.
        const escorted = input.directives.find(e => e.id === d.escortedId);
        return escorted?.status === 'active' && escorted.baseRoomName
            ? { baseRoomName: escorted.baseRoomName }
            : { waiting: `waiting for ${d.escortedId} to be assigned a base` };
    }
    const minCapacity = d.type === 'claim' ? CLAIM_MIN_CAPACITY : isMilitary(d.type) ? MILITARY_MIN_CAPACITY : 0;
    const eligible = input.bases
        .filter(b => b.energyCapacity >= minCapacity)
        .filter(b => roomLinearDistance(b.roomName, d.targetRoom) <= MAX_DIRECTIVE_DISTANCE)
        .sort((a, b) => roomLinearDistance(a.roomName, d.targetRoom) - roomLinearDistance(b.roomName, d.targetRoom)
            || a.roomName.localeCompare(b.roomName));
    if (eligible.length === 0) {
        return { waiting: minCapacity > 0
            ? `no base within ${MAX_DIRECTIVE_DISTANCE} rooms with ${minCapacity} energy capacity`
            : `no base within ${MAX_DIRECTIVE_DISTANCE} rooms` };
    }
    return { baseRoomName: eligible[0].roomName };
}
