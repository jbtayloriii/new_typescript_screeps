import { Intent } from "intents/types";
import { actOrApproach } from "intents/helpers";
import { getMyStructures } from "snapshot/queries";
import { MyCreepSnapshot, Pos, RoomSnapshot } from "snapshot/types";
import { buildNearest, gatherEnergy, runWorker, upgradeController } from "./behaviors";
import { BodyPattern, ClaimTaskMemory, SpawnRequest, TaskContext, TaskDefinition } from "./types";
import { ClaimPhase } from "directives/types";
import { SCOUT_BODY } from "./scout_task";
import { claimRoomThreats, TICKS_PER_ROOM } from "directives/claim_evaluation";
import { spawnTicks } from "spawning/body";

/**
 * [CLAIM, MOVE×5] (850) at full size: 1 tile/tick even on swamp, so the route check (under 500
 * ticks of its 600) holds. Smaller bases (only with `force`) get fewer MOVE parts.
 */
export const CLAIMER_BODY: BodyPattern = { base: [CLAIM, MOVE], pattern: [MOVE], maxRepeats: 4 };
export const PIONEER_BODY: BodyPattern = { pattern: [WORK, CARRY, MOVE], maxRepeats: 5 };
/** Pioneers: one per open tile at each source, at most PIONEERS_PER_SOURCE each, and at least MIN_PIONEERS. */
export const PIONEERS_PER_SOURCE = 2;
export const MIN_PIONEERS = 2;

/**
 * Above extra upgraders (50 and down) and remote mining (40 and down), which a healthy base can
 * keep requesting indefinitely; below repair (60), building and the core economy. A base only
 * sends a claim once it's ready (see `claim_evaluation.ts`).
 */
export const CLAIMER_PRIORITY = 58;
export const PIONEER_PRIORITY = 55;

/** While incubating, the parent keeps this many of its pioneers working in the new base. */
export const INCUBATION_HELPERS = 2;

/** Pioneers upgrade before building while the new controller is this close to downgrading. */
export const DOWNGRADE_UPGRADE_TICKS = 5000;

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
    // Harvest in the new room and build its spawn; buildNearest upgrades when there's nothing to
    // build. A claimed room is lost if its controller downgrades at RCL 1, so upgrade first then.
    const downgrading = live.controller?.my && live.controller.ticksToDowngrade < DOWNGRADE_UPGRADE_TICKS;
    return runWorker(creep, live, gatherEnergy({ fromStores: true }), downgrading ? upgradeController : buildNearest);
}

/**
 * How many pioneers the claim wants: one per open tile next to each source (from terrain, so it
 * works without vision), at most PIONEERS_PER_SOURCE per source, and at least MIN_PIONEERS.
 */
export function pioneersWanted(task: ClaimTaskMemory, ctx: TaskContext): number {
    const terrain = ctx.world.getTerrain(task.targetRoom);
    const live = ctx.world.getRoom(task.targetRoom);
    const sources = live ? live.sources.map(s => s.pos) : ctx.intel[task.targetRoom]?.sources ?? [];
    const perSource = sources.map(source => {
        let open = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const x = source.x + dx, y = source.y + dy;
                if ((dx !== 0 || dy !== 0) && x >= 0 && y >= 0 && x < 50 && y < 50 && !terrain.isWall(x, y)) open++;
            }
        }
        return Math.min(open, PIONEERS_PER_SOURCE);
    });
    return Math.max(MIN_PIONEERS, perSource.reduce((a, b) => a + b, 0));
}

/** Ticks a pioneer takes to reach the room: measured (see `claim_phases.ts`), else estimated from the route. */
export function pioneerTravelTicks(task: ClaimTaskMemory, ctx: TaskContext): number {
    const directive = ctx.directives[task.directiveId];
    return directive?.pioneerTravelTicks ?? (directive?.route?.length ?? 1) * TICKS_PER_ROOM;
}

function pioneerRequest(task: ClaimTaskMemory): SpawnRequest {
    return {
        taskName: task.name, priority: PIONEER_PRIORITY, body: PIONEER_BODY,
        memory: { role: 'pioneer', targetRoom: task.targetRoom, helperFor: task.directiveId },
    };
}

/**
 * Incubation: keeps INCUBATION_HELPERS of this claim's pioneers alive, counting the ones already
 * handed over to the new base (`helperFor` survives the handover). Replaced early, like pioneers.
 */
function helperRequests(task: ClaimTaskMemory, ctx: TaskContext): SpawnRequest[] {
    const travel = pioneerTravelTicks(task, ctx);
    const lasting = ctx.world.myCreeps.filter(c => c.memory.helperFor === task.directiveId && pioneerLasts(c, travel)).length;
    return Array.from({ length: Math.max(0, INCUBATION_HELPERS - lasting) }, () => pioneerRequest(task));
}

/** True while a pioneer still has time to work before its replacement should be on the way. */
function pioneerLasts(creep: MyCreepSnapshot, travel: number): boolean {
    if (creep.ticksToLive === undefined) {
        return true;
    }
    const parts = Object.values(creep.activeParts).reduce((sum, n) => sum + (n ?? 0), 0);
    return creep.ticksToLive >= spawnTicks(parts) + travel;
}

/**
 * Claims a room and builds its first spawn, following the directive's phase (see
 * `directives/claim_phases.ts`):
 * 0. scouting: a [MOVE] scout goes to the room so it has fresh intel. evaluating: nothing to spawn.
 * 1. claiming: a claimer walks the planned route to the controller and claims it.
 * 2. building: pioneers (one per open source tile, at most 2 per source; see `pioneersWanted`)
 *    walk over, place the spawn site (at the directive's spawn position), harvest in the new
 *    room and build it, upgrading first when the controller is close to downgrading.
 *    Replacements spawn early enough to arrive as the old ones die.
 * While the room is threatened (`claimRoomThreats`), nothing new is spawned for it, and the
 * claimer and pioneers wait in the middle of the home room.
 * 3. Once the spawn exists, `Headquarters` creates the new base and `planDirectives` hands this
 *    task's pioneers and claimer in the room over to it.
 * 4. incubating: the parent keeps INCUBATION_HELPERS pioneers working in the new base (each is
 *    handed over as it arrives) until it reaches RCL 3 with a tower; then the claim is done.
 */
export const claimTask: TaskDefinition<ClaimTaskMemory> = {
    getSpawnRequests(task, ctx) {
        const live = ctx.world.getRoom(task.targetRoom);
        const phase = claimPhase(task, ctx);
        if (phase === 'incubating') {
            return helperRequests(task, ctx);
        }
        if (live && hasSpawn(live)) {
            return [];
        }
        // Nothing new goes into a threatened room; the creeps there wait at home.
        const threatened = claimRoomThreats(ctx.world, ctx.intel, task.targetRoom).length > 0;
        if (threatened && phase !== 'scouting') {
            return [];
        }
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
        // Replacements spawn early, so a new pioneer arrives as an old one dies.
        const travel = pioneerTravelTicks(task, ctx);
        const lasting = ctx.creeps.filter(c => c.memory.role === 'pioneer' && pioneerLasts(c, travel)).length;
        const requests: SpawnRequest[] = [];
        for (let i = lasting; i < pioneersWanted(task, ctx); i++) {
            requests.push(pioneerRequest(task));
        }
        return requests;
    },

    decide(task, ctx) {
        const live = ctx.world.getRoom(task.targetRoom);
        const intents: Intent[] = [];
        const spawned = live !== undefined && hasSpawn(live);

        // Once the spawn exists, only incubation helpers on their way are left to move (they join
        // the new base when they arrive).
        if (spawned && claimPhase(task, ctx) !== 'incubating') {
            return intents;
        }

        const threatened = claimRoomThreats(ctx.world, ctx.intel, task.targetRoom).length > 0;
        for (const creep of ctx.creeps) {
            if (creep.spawning) {
                continue;
            }
            if (threatened && creep.memory.role !== 'scout') {
                // Keep away: wait in the middle of the home room (not on an exit tile, where a
                // creep bounces between rooms) until the room is clear.
                const home = { x: 25, y: 25, roomName: ctx.home.name };
                if (creep.pos.roomName !== ctx.home.name || Math.max(Math.abs(creep.pos.x - 25), Math.abs(creep.pos.y - 25)) > ROOM_CENTER_RANGE) {
                    intents.push({ kind: 'move', creepName: creep.name, target: home, range: ROOM_CENTER_RANGE });
                }
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
        if (!spawned && live?.controller?.my && spawnPos && !live.constructionSites.some(s => s.structureType === STRUCTURE_SPAWN)) {
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
