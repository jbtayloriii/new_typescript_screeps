import { Intent } from "intents/types";
import { getMyStructures, getRange } from "snapshot/queries";
import { MyCreepSnapshot, Pos, RoomSnapshot } from "snapshot/types";
import { buildBody } from "spawning/body";
import { Behavior, deliverEnergy, runWorker, stepToIntents } from "./behaviors";
import { REMOTE_SOURCE_ENERGY_PER_TICK } from "./economy";
import { collectEnergy } from "./haul_task";
import { remoteBlocker } from "./remote_selection";
import { BodyPattern, RemoteMineTaskMemory, SpawnRequest, TaskContext, TaskDefinition } from "./types";

/** 3 WORK harvest the 5 energy/tick an unreserved source gives; 1 MOVE per part to travel at full speed. */
export const REMOTE_MINER_BODY: BodyPattern = { base: [WORK, WORK, WORK, MOVE, MOVE, MOVE], pattern: [], maxRepeats: 0 };
export const REMOTE_HAULER_BODY: BodyPattern = { pattern: [CARRY, MOVE], maxRepeats: 10 };

export const REMOTE_MINER_PRIORITY = 40;
export const REMOTE_HAULER_PRIORITY = 35;

/** Rough one-way path length from the base to an adjacent room's sources. */
export const REMOTE_DISTANCE_ESTIMATE = 50;

/** After hostiles are seen, the remote stays paused (creeps at home) for this long. */
export const REMOTE_THREAT_COOLDOWN = 300;

const ROOM_CENTER_RANGE = 20;

/** True if the remote room has hostile combat creeps now, or had them recently. */
export function isRemoteThreatened(task: RemoteMineTaskMemory, ctx: TaskContext): boolean {
    const live = ctx.world.getRoom(task.targetRoom);
    if (live && live.hostileCreeps.some(h => (h.activeParts[ATTACK] ?? 0) + (h.activeParts[RANGED_ATTACK] ?? 0) > 0)) {
        return true;
    }
    const seen = ctx.intel[task.targetRoom]?.hostilesLastSeen;
    return seen !== undefined && ctx.world.tick - seen < REMOTE_THREAT_COOLDOWN;
}

/** Source positions in the remote room: live when visible, otherwise from intel. */
function remoteSources(task: RemoteMineTaskMemory, ctx: TaskContext): { id: Id<Source>, pos: Pos, energy?: number }[] {
    const live = ctx.world.getRoom(task.targetRoom);
    if (live) {
        return live.sources.map(s => ({ id: s.id, pos: s.pos, energy: s.energy }));
    }
    return (ctx.intel[task.targetRoom]?.sources ?? [])
        .map(s => ({ id: s.id, pos: { x: s.x, y: s.y, roomName: task.targetRoom } }));
}

function moveToRoom(creep: MyCreepSnapshot, roomName: RoomName): Intent {
    return { kind: 'move', creepName: creep.name, target: { x: 25, y: 25, roomName }, range: ROOM_CENTER_RANGE };
}

function decideMiner(creep: MyCreepSnapshot, task: RemoteMineTaskMemory, ctx: TaskContext): Intent[] {
    const sources = remoteSources(task, ctx);
    const source = sources.find(s => s.id === creep.memory.targetId) ?? sources[0];
    if (!source) {
        return [moveToRoom(creep, task.targetRoom)];
    }
    if (creep.pos.roomName !== task.targetRoom || getRange(creep.pos, source.pos) > 1) {
        return [{ kind: 'move', creepName: creep.name, target: source.pos, range: 1 }];
    }
    return (source.energy ?? 1) > 0 ? [{ kind: 'harvest', creepName: creep.name, targetId: source.id }] : [];
}

/** Gathers drop-mined energy in the remote room, travelling there first. */
function gatherRemote(task: RemoteMineTaskMemory, ctx: TaskContext, haulers: readonly MyCreepSnapshot[]): Behavior {
    const collect = collectEnergy(haulers);
    return (creep) => {
        const live = ctx.world.getRoom(task.targetRoom);
        const waitAt = remoteSources(task, ctx)[0]?.pos;
        if (creep.pos.roomName !== task.targetRoom || !live) {
            return { action: waitAt
                ? { kind: 'move', creepName: creep.name, target: waitAt, range: 2 }
                : { kind: 'move', creepName: creep.name, target: { x: 25, y: 25, roomName: task.targetRoom }, range: ROOM_CENTER_RANGE } };
        }
        const step = collect(creep, live);
        if (!step.action && waitAt && getRange(creep.pos, waitAt) > 2) {
            return { action: { kind: 'move', creepName: creep.name, target: waitAt, range: 2 } };
        }
        return step;
    };
}

/** Carries energy home: walks to the base, then delivers like a normal hauler. */
function deliverHome(home: RoomSnapshot): Behavior {
    return (creep) => {
        if (creep.pos.roomName === home.name) {
            return deliverEnergy(creep, home);
        }
        const storage = getMyStructures(home, STRUCTURE_STORAGE)[0];
        const spawn = getMyStructures(home, STRUCTURE_SPAWN)[0];
        const target = storage?.pos ?? spawn?.pos;
        return { action: target
            ? { kind: 'move', creepName: creep.name, target, range: 1 }
            : { kind: 'move', creepName: creep.name, target: { x: 25, y: 25, roomName: home.name }, range: ROOM_CENTER_RANGE } };
    };
}

/**
 * Mines an adjacent room's sources (drop mining, no containers yet) and hauls the energy home.
 * Miners are spawned already assigned to a source (`memory.targetId`). When hostiles show up,
 * the task stops spawning and its creeps go home until the room has been clear for a while.
 */
export const remoteMineTask: TaskDefinition<RemoteMineTaskMemory> = {
    getSpawnRequests(task, ctx) {
        if (isRemoteThreatened(task, ctx)) {
            return [];
        }
        const sources = remoteSources(task, ctx);
        const requests: SpawnRequest[] = [];
        for (const source of sources) {
            if (!ctx.creeps.some(c => c.memory.role === 'miner' && c.memory.targetId === source.id)) {
                requests.push({
                    taskName: task.name, priority: REMOTE_MINER_PRIORITY, body: REMOTE_MINER_BODY,
                    memory: { role: 'miner', targetId: source.id },
                });
            }
        }
        const carryPerHauler = (buildBody(REMOTE_HAULER_BODY, ctx.home.energyCapacityAvailable) ?? [CARRY])
            .filter(p => p === CARRY).length;
        const carryNeeded = sources.length * Math.ceil(2 * REMOTE_DISTANCE_ESTIMATE * REMOTE_SOURCE_ENERGY_PER_TICK / CARRY_CAPACITY);
        const haulers = ctx.creeps.filter(c => c.memory.role === 'hauler').length;
        for (let i = haulers; i < Math.ceil(carryNeeded / carryPerHauler); i++) {
            requests.push({
                taskName: task.name, priority: REMOTE_HAULER_PRIORITY - i, body: REMOTE_HAULER_BODY,
                memory: { role: 'hauler' },
            });
        }
        return requests;
    },

    decide(task, ctx) {
        const threatened = isRemoteThreatened(task, ctx);
        const haulers = ctx.creeps.filter(c => c.memory.role === 'hauler');
        const intents: Intent[] = [];
        for (const creep of ctx.creeps) {
            if (creep.spawning) {
                continue;
            }
            if (threatened) {
                // Retreat; loaded haulers still deliver what they carry.
                if (creep.memory.role === 'hauler' && creep.store.energy > 0) {
                    intents.push(...stepToIntents(creep.name, deliverHome(ctx.home)(creep, ctx.home)));
                } else if (creep.pos.roomName !== ctx.home.name) {
                    intents.push(moveToRoom(creep, ctx.home.name));
                }
            } else if (creep.memory.role === 'miner') {
                intents.push(...decideMiner(creep, task, ctx));
            } else {
                intents.push(...runWorker(creep, ctx.home, gatherRemote(task, ctx, haulers), deliverHome(ctx.home)));
            }
        }
        return intents;
    },

    isDone(task, ctx) {
        const intel = ctx.intel[task.targetRoom];
        // Without intel we can't tell; keep going. Otherwise stop if the room became unusable.
        return intel !== undefined && remoteBlocker(intel, ctx.world.myUsername) !== null;
    },
};
