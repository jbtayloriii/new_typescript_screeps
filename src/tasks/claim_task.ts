import { Intent } from "intents/types";
import { actOrApproach } from "intents/helpers";
import { getMyStructures } from "snapshot/queries";
import { MyCreepSnapshot, Pos, RoomSnapshot } from "snapshot/types";
import { buildNearest, gatherEnergy, runWorker } from "./behaviors";
import { BodyPattern, ClaimTaskMemory, SpawnRequest, TaskContext, TaskDefinition } from "./types";

export const CLAIMER_BODY: BodyPattern = { base: [CLAIM, MOVE], pattern: [], maxRepeats: 0 };
export const PIONEER_BODY: BodyPattern = { pattern: [WORK, CARRY, MOVE], maxRepeats: 5 };
export const PIONEERS = 2;

export const CLAIMER_PRIORITY = 30;
export const PIONEER_PRIORITY = 25;

const ROOM_CENTER_RANGE = 20;

/** True once the target room's controller is mine (live if visible, else from intel). */
export function isClaimed(task: ClaimTaskMemory, ctx: TaskContext): boolean {
    const live = ctx.world.getRoom(task.targetRoom);
    if (live) {
        return live.controller?.my ?? false;
    }
    const owner = ctx.intel[task.targetRoom]?.controller?.owner;
    return owner !== undefined && owner === ctx.world.myUsername;
}

function controllerPos(task: ClaimTaskMemory, ctx: TaskContext): Pos | null {
    const live = ctx.world.getRoom(task.targetRoom);
    if (live?.controller) {
        return live.controller.pos;
    }
    const c = ctx.intel[task.targetRoom]?.controller;
    return c ? { x: c.x, y: c.y, roomName: task.targetRoom } : null;
}

function hasSpawn(room: RoomSnapshot): boolean {
    return getMyStructures(room, STRUCTURE_SPAWN).length > 0;
}

function decideClaimer(creep: MyCreepSnapshot, task: ClaimTaskMemory, ctx: TaskContext): Intent[] {
    const live = ctx.world.getRoom(task.targetRoom);
    const target = controllerPos(task, ctx);
    if (!target) {
        return [{ kind: 'move', creepName: creep.name, target: { x: 25, y: 25, roomName: task.targetRoom }, range: ROOM_CENTER_RANGE }];
    }
    if (!live?.controller || creep.pos.roomName !== task.targetRoom) {
        return [{ kind: 'move', creepName: creep.name, target, range: 1 }];
    }
    // A room reserved by someone else can't be claimed until the reservation is cleared.
    const theirs = live.controller.reservation && live.controller.reservation.username !== ctx.world.myUsername;
    return [actOrApproach(creep.pos, target, {
        kind: theirs ? 'attackController' : 'claimController', creepName: creep.name, targetId: live.controller.id,
    })];
}

function decidePioneer(creep: MyCreepSnapshot, task: ClaimTaskMemory, ctx: TaskContext): Intent[] {
    const live = ctx.world.getRoom(task.targetRoom);
    if (!live || creep.pos.roomName !== task.targetRoom) {
        return [{ kind: 'move', creepName: creep.name, target: { x: 25, y: 25, roomName: task.targetRoom }, range: ROOM_CENTER_RANGE }];
    }
    // Harvest in the new room and build its spawn; buildNearest upgrades when there's nothing to build.
    return runWorker(creep, live, gatherEnergy({ fromStores: true }), buildNearest);
}

/**
 * Claims a room and builds its first spawn:
 * 1. A claimer ([CLAIM, MOVE]) walks to the controller and claims it.
 * 2. Pioneers walk over, place the spawn site (at the directive's spawn position), harvest in the
 *    new room and build it.
 * 3. Once the spawn exists, `Headquarters` creates the new base, and `planDirectives` marks the
 *    directive done and hands this task's creeps in the room over to the new base.
 */
export const claimTask: TaskDefinition<ClaimTaskMemory> = {
    getSpawnRequests(task, ctx) {
        const live = ctx.world.getRoom(task.targetRoom);
        if (live && hasSpawn(live)) {
            return [];
        }
        if (!isClaimed(task, ctx)) {
            return ctx.creeps.some(c => c.memory.role === 'claimer')
                ? []
                : [{ taskName: task.name, priority: CLAIMER_PRIORITY, body: CLAIMER_BODY, memory: { role: 'claimer' } }];
        }
        const requests: SpawnRequest[] = [];
        for (let i = ctx.creeps.filter(c => c.memory.role === 'pioneer').length; i < PIONEERS; i++) {
            requests.push({ taskName: task.name, priority: PIONEER_PRIORITY, body: PIONEER_BODY, memory: { role: 'pioneer' } });
        }
        return requests;
    },

    decide(task, ctx) {
        const live = ctx.world.getRoom(task.targetRoom);
        const intents: Intent[] = [];

        if (live && hasSpawn(live)) {
            return intents;
        }

        for (const creep of ctx.creeps) {
            if (creep.spawning) {
                continue;
            }
            if (creep.memory.role === 'claimer') {
                intents.push(...decideClaimer(creep, task, ctx));
            } else {
                intents.push(...decidePioneer(creep, task, ctx));
            }
        }

        const spawnPos = ctx.directives[task.directiveId]?.spawnPos;
        if (live?.controller?.my && spawnPos && !live.constructionSites.some(s => s.structureType === STRUCTURE_SPAWN)) {
            intents.push({
                kind: 'createConstructionSite',
                pos: { x: spawnPos.x, y: spawnPos.y, roomName: task.targetRoom },
                structureType: STRUCTURE_SPAWN,
            });
        }
        return intents;
    },

    isDone(task, ctx) {
        return ctx.directives[task.directiveId]?.status !== 'active';
    },
};
