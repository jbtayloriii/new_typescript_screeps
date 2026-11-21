import { IntelMap } from "intel/types";
import { Intent } from "intents/types";
import { WorldSnapshot } from "snapshot/world";
import { chooseNewRemoteRooms, remoteBlocker } from "tasks/remote_selection";
import { roomLinearDistance } from "utils/room_names";
import { parseFlag } from "./flags";
import { chooseSpawnPosition } from "./spawn_position";
import { Directive, DirectiveSpec, isEnded } from "./types";

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

/**
 * The empire-level step, run once per tick before the bases. All pure:
 * 1. Flags: new directive flags create directives; removed flags cancel theirs.
 * 2. Finish directives whose goal is met or impossible (and remove their flags).
 * 3. Assign pending directives to the closest suitable base.
 * 4. Claims: pick a spawn position once the room's intel exists.
 * 5. Automatic remote mining: each static base gets remote rooms up to its limit.
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
    }
}

/** The closest base that can run the directive, or why it has to wait. */
function assignBase(d: Directive, input: DirectivePlanInput): { baseRoomName: RoomName } | { waiting: string } {
    if (d.type === 'claim' && input.world.gclLevel <= input.world.ownedRooms.length) {
        return { waiting: `GCL ${input.world.gclLevel} is too low to claim another room` };
    }
    const eligible = input.bases
        .filter(b => d.type !== 'claim' || b.energyCapacity >= CLAIM_MIN_CAPACITY)
        .filter(b => roomLinearDistance(b.roomName, d.targetRoom) <= MAX_DIRECTIVE_DISTANCE)
        .sort((a, b) => roomLinearDistance(a.roomName, d.targetRoom) - roomLinearDistance(b.roomName, d.targetRoom)
            || a.roomName.localeCompare(b.roomName));
    if (eligible.length === 0) {
        return { waiting: d.type === 'claim'
            ? `no base within ${MAX_DIRECTIVE_DISTANCE} rooms with ${CLAIM_MIN_CAPACITY} energy capacity`
            : `no base within ${MAX_DIRECTIVE_DISTANCE} rooms` };
    }
    return { baseRoomName: eligible[0].roomName };
}
