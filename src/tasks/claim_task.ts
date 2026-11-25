import { Intent } from "intents/types";
import { actOrApproach } from "intents/helpers";
import { getMyStructures } from "snapshot/queries";
import { MyCreepSnapshot, Pos, RoomSnapshot } from "snapshot/types";
import { buildNearest, gatherEnergy, runWorker } from "./behaviors";
import { BodyPattern, ClaimTaskMemory, SpawnRequest, TaskContext, TaskDefinition } from "./types";
import { ClaimPhase } from "directives/types";
import { SCOUT_BODY } from "./scout_task";

/**
 * [CLAIM, MOVE×5] (850) at full size: 1 tile/tick even on swamp, so the route check (under 500
 * ticks of its 600) holds. Smaller bases (only with `force`) get fewer MOVE parts.
 */
export const CLAIMER_BODY: BodyPattern = { base: [CLAIM, MOVE], pattern: [MOVE], maxRepeats: 4 };
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

/** The claim's phase: from its directive, else from the room (claims made before phases existed). */
export function claimPhase(task: ClaimTaskMemory, ctx: TaskContext): ClaimPhase {
    return ctx.directives[task.directiveId]?.phase ?? (isClaimed(task, ctx) ? 'building' : 'claiming');
}

/** The planned route from the base, if any (see `claim_phases.ts`). */
function routeOf(task: ClaimTaskMemory, ctx: TaskContext): readonly RoomName[] | undefined {
    return ctx.directives[task.directiveId]?.route;
}

/** Moves a creep to the target room's center, along the planned route. */
function goToRoom(creep: MyCreepSnapshot, task: ClaimTaskMemory, ctx: TaskContext): Intent {
    const route = routeOf(task, ctx);
    return {
        kind: 'move', creepName: creep.name, target: { x: 25, y: 25, roomName: task.targetRoom }, range: ROOM_CENTER_RANGE,
        ...(route ? { route } : {}),
    };
}

function decideClaimer(creep: MyCreepSnapshot, task: ClaimTaskMemory, ctx: TaskContext): Intent[] {
    const live = ctx.world.getRoom(task.targetRoom);
    const target = controllerPos(task, ctx);
    if (!target) {
        return [goToRoom(creep, task, ctx)];
    }
    if (!live?.controller || creep.pos.roomName !== task.targetRoom) {
        const route = routeOf(task, ctx);
        return [{ kind: 'move', creepName: creep.name, target, range: 1, ...(route ? { route } : {}) }];
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
        return [goToRoom(creep, task, ctx)];
    }
    // Harvest in the new room and build its spawn; buildNearest upgrades when there's nothing to build.
    return runWorker(creep, live, gatherEnergy({ fromStores: true }), buildNearest);
}

/**
 * Claims a room and builds its first spawn, following the directive's phase (see
 * `directives/claim_phases.ts`):
 * 0. scouting: a [MOVE] scout goes to the room so it has fresh intel. evaluating: nothing to spawn.
 * 1. claiming: a claimer walks the planned route to the controller and claims it.
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
        const phase = claimPhase(task, ctx);
        if (phase === 'scouting') {
            return ctx.creeps.some(c => c.memory.role === 'scout')
                ? []
                : [{ taskName: task.name, priority: CLAIMER_PRIORITY, body: SCOUT_BODY, memory: { role: 'scout', targetRoom: task.targetRoom } }];
        }
        if (phase === 'evaluating') {
            return [];
        }
        if (phase === 'claiming') {
            return ctx.creeps.some(c => c.memory.role === 'claimer')
                ? []
                : [{ taskName: task.name, priority: CLAIMER_PRIORITY, body: CLAIMER_BODY, memory: { role: 'claimer', targetRoom: task.targetRoom } }];
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
            if (creep.memory.role === 'scout') {
                // Stays in the room once there: its vision keeps intel fresh for the claim.
                if (creep.pos.roomName !== task.targetRoom || Math.max(Math.abs(creep.pos.x - 25), Math.abs(creep.pos.y - 25)) > ROOM_CENTER_RANGE) {
                    intents.push(goToRoom(creep, task, ctx));
                }
            } else if (creep.memory.role === 'claimer') {
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
