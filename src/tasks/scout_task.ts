import { Intent } from "intents/types";
import { BodyPattern, ScoutTaskMemory, TaskContext, TaskDefinition } from "./types";

export const SCOUT_BODY: BodyPattern = { pattern: [MOVE], maxRepeats: 1 };
export const SCOUT_PRIORITY = 10;

/** Intel older than this is refreshed. */
export const INTEL_STALE_TICKS = 5000;

/** Scouts stop within this range of a room's center, safely inside the room (not on an exit). */
const ROOM_CENTER_RANGE = 20;

/** Rooms next to the base whose intel is missing or stale: missing first, then oldest. */
export function staleNeighbors(ctx: TaskContext): RoomName[] {
    const tick = ctx.world.tick;
    const age = (room: RoomName) => ctx.intel[room] ? tick - ctx.intel[room].lastSeen : Infinity;
    return ctx.world.getExits(ctx.home.name)
        .filter(room => age(room) > INTEL_STALE_TICKS)
        .sort((a, b) => age(b) - age(a) || a.localeCompare(b));
}

function center(roomName: RoomName) {
    return { x: 25, y: 25, roomName };
}

/**
 * Keeps intel on adjacent rooms fresh with one cheap [MOVE] creep. The scout only needs to
 * enter a room: `Headquarters` records intel for every visible room. While no neighbor is
 * stale, no scout is spawned and an existing one returns home.
 */
export const scoutTask: TaskDefinition<ScoutTaskMemory> = {
    getSpawnRequests(task, ctx) {
        if (ctx.creeps.length > 0 || staleNeighbors(ctx).length === 0) {
            return [];
        }
        return [{ taskName: task.name, priority: SCOUT_PRIORITY, body: SCOUT_BODY }];
    },

    decide(task, ctx) {
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

    isDone() {
        return false;
    },
};
