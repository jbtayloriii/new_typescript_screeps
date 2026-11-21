import { Intent } from "intents/types";
import { BodyPattern, ScoutTaskMemory, TaskContext, TaskDefinition } from "./types";
import { WorldSnapshot } from "snapshot/world";

export const SCOUT_BODY: BodyPattern = { pattern: [MOVE], maxRepeats: 1 };
export const SCOUT_PRIORITY = 10;

/** Intel older than this is refreshed. */
export const INTEL_STALE_TICKS = 5000;

/** Scouts stop within this range of a room's center, safely inside the room (not on an exit). */
const ROOM_CENTER_RANGE = 20;

/** The routine scout keeps intel fresh for rooms up to this many exits from the base. */
export const SCOUT_RANGE_EXITS = 2;

/** Rooms within `maxExits` exits of `start` (not including it), with their distance in exits. */
export function roomsWithinExits(world: WorldSnapshot, start: RoomName, maxExits: number): Map<RoomName, number> {
    const distances = new Map<RoomName, number>([[start, 0]]);
    let frontier = [start];
    for (let d = 1; d <= maxExits; d++) {
        const next: RoomName[] = [];
        for (const room of frontier) {
            for (const exit of world.getExits(room)) {
                if (!distances.has(exit)) {
                    distances.set(exit, d);
                    next.push(exit);
                }
            }
        }
        frontier = next;
    }
    distances.delete(start);
    return distances;
}

/**
 * Rooms within SCOUT_RANGE_EXITS of the base whose intel is missing or stale. Closer rooms first
 * (adjacent rooms matter most: they're remote mining candidates), then missing before oldest.
 */
export function staleNeighbors(ctx: TaskContext): RoomName[] {
    const tick = ctx.world.tick;
    const age = (room: RoomName) => ctx.intel[room] ? tick - ctx.intel[room].lastSeen : Infinity;
    const nearby = roomsWithinExits(ctx.world, ctx.home.name, SCOUT_RANGE_EXITS);
    return [...nearby.keys()]
        .filter(room => age(room) > INTEL_STALE_TICKS)
        .sort((a, b) => nearby.get(a)! - nearby.get(b)! || age(b) - age(a) || a.localeCompare(b));
}

function center(roomName: RoomName) {
    return { x: 25, y: 25, roomName };
}

/** For a scout directive: true until the room has been seen since the directive was created. */
function directiveRoomUnseen(task: ScoutTaskMemory, ctx: TaskContext): boolean {
    const since = (task.directiveId && ctx.directives[task.directiveId]?.createdAt) || 0;
    const intel = task.targetRoom ? ctx.intel[task.targetRoom] : undefined;
    return !intel || intel.lastSeen < since;
}

/**
 * Two modes, each with one cheap [MOVE] creep. The scout only needs to enter a room:
 * `Headquarters` records intel for every visible room.
 * - Routine (no `targetRoom`): keeps intel fresh for rooms up to 2 exits away. While none is
 *   stale, no scout is spawned and an existing one returns home.
 * - Directive (`targetRoom`): goes to that room, however far, until it has been seen.
 */
export const scoutTask: TaskDefinition<ScoutTaskMemory> = {
    getSpawnRequests(task, ctx) {
        const needed = task.targetRoom ? directiveRoomUnseen(task, ctx) : staleNeighbors(ctx).length > 0;
        if (ctx.creeps.length > 0 || !needed) {
            return [];
        }
        return [{ taskName: task.name, priority: SCOUT_PRIORITY, body: SCOUT_BODY }];
    },

    decide(task, ctx) {
        if (task.targetRoom) {
            return ctx.creeps.filter(c => !c.spawning).map((creep): Intent =>
                ({ kind: 'move', creepName: creep.name, target: center(task.targetRoom!), range: ROOM_CENTER_RANGE }));
        }
        const stale = staleNeighbors(ctx);
        const intents: Intent[] = [];
        for (const creep of ctx.creeps) {
            if (creep.spawning) {
                continue;
            }
            // Keep heading to the current target until it's been seen (then it's no longer stale).
            const current = creep.memory.targetRoom;
            const next = current && stale.includes(current) ? current : stale[0];
            if (next) {
                intents.push({ kind: 'move', creepName: creep.name, target: center(next), range: ROOM_CENTER_RANGE });
            } else if (creep.pos.roomName !== ctx.home.name) {
                intents.push({ kind: 'move', creepName: creep.name, target: center(ctx.home.name), range: ROOM_CENTER_RANGE });
            }
            if (next !== current) {
                intents.push({ kind: 'setCreepMemory', creepName: creep.name, patch: { targetRoom: next } });
            }
        }
        return intents;
    },

    isDone(task, ctx) {
        // Directive scouts end with their directive; the routine scout never does.
        return task.directiveId !== undefined && ctx.directives[task.directiveId]?.status !== 'active';
    },
};
