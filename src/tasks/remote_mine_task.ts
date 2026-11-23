import { Intent } from "intents/types";
import { actOrApproach } from "intents/helpers";
import { findClosestByRange, getMyStructures, getRange, isInRange } from "snapshot/queries";
import { MyCreepSnapshot, Pos, RoomSnapshot } from "snapshot/types";
import { TerrainView } from "snapshot/world";
import { buildBody } from "spawning/body";
import { Behavior, deliverEnergy, runWorker, stepToIntents } from "./behaviors";
import { OWNED_SOURCE_ENERGY_PER_TICK, REMOTE_SOURCE_ENERGY_PER_TICK } from "./economy";
import { collectEnergy } from "./haul_task";
import { planRemoteRoads, remoteRoadStage, RemoteRoadStage } from "./remote_roads";
import { BodyPattern, RemoteMineTaskMemory, SpawnRequest, TaskContext, TaskDefinition } from "./types";

/** 3 WORK harvest the 5 energy/tick an unreserved source gives; 1 MOVE per part to travel at full speed. */
export const REMOTE_MINER_BODY: BodyPattern = { base: [WORK, WORK, WORK, MOVE, MOVE, MOVE], pattern: [], maxRepeats: 0 };
/**
 * While the room is reserved, sources give 10 energy/tick: 5 WORK, plus a CARRY so the miner can
 * build and repair its container.
 */
export const RESERVED_REMOTE_MINER_BODY: BodyPattern = {
    base: [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE], pattern: [], maxRepeats: 0,
};
export const REMOTE_HAULER_BODY: BodyPattern = { pattern: [CARRY, MOVE], maxRepeats: 10 };
/** Once roads are being built, haulers get one WORK part to build and repair them as they walk. */
export const ROAD_HAULER_BODY: BodyPattern = { base: [WORK, CARRY, MOVE], pattern: [CARRY, MOVE], maxRepeats: 10 };
/** Each CLAIM part adds 1 reservation tick per tick; 2 parts out-pace the 1/tick decay. */
export const RESERVER_BODY: BodyPattern = { pattern: [CLAIM, MOVE], maxRepeats: 2 };

export const REMOTE_MINER_PRIORITY = 40;
export const REMOTE_HAULER_PRIORITY = 35;
export const RESERVER_PRIORITY = 30;

/** Energy capacity needed for a reserver with 2 CLAIM parts. */
export const RESERVER_MIN_CAPACITY = 2 * (BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]);
/** A reserver is sent when the reservation has less than this many ticks left (the max is 5000). */
export const RESERVATION_TOP_UP = 3000;

/** One-way path length used until the base has measured the real one. */
export const REMOTE_DISTANCE_ESTIMATE = 50;

/** After hostiles are seen, the remote stays paused (creeps at home) for this long. */
export const REMOTE_THREAT_COOLDOWN = 300;

/** The remote miner repairs its container below this fraction of max hits. */
const CONTAINER_REPAIR_BELOW = 0.5;
/** Haulers repair road tiles below this fraction of max hits as they pass. */
const ROAD_REPAIR_BELOW = 0.6;

const ROOM_CENTER_RANGE = 20;

/** The remote room's reservation: who holds it and for how many more ticks (live, else from intel). */
export function remoteReservation(task: RemoteMineTaskMemory, ctx: TaskContext): { username: string, ticksLeft: number } | null {
    const live = ctx.world.getRoom(task.targetRoom);
    if (live) {
        const r = live.controller?.reservation;
        return r ? { username: r.username, ticksLeft: r.ticksToEnd } : null;
    }
    const c = ctx.intel[task.targetRoom]?.controller;
    if (!c?.reservedBy || c.reservationEnd === undefined || c.reservationEnd <= ctx.world.tick) {
        return null;
    }
    return { username: c.reservedBy, ticksLeft: c.reservationEnd - ctx.world.tick };
}

export function isReservedByMe(task: RemoteMineTaskMemory, ctx: TaskContext): boolean {
    return remoteReservation(task, ctx)?.username === ctx.world.myUsername;
}

/**
 * True if the remote room has hostile combat creeps now, had them recently, or has an Invader
 * core (the base's automatic defend directive sends a squad to destroy it). A leftover Invader
 * reservation alone doesn't pause the remote: the reserver clears it.
 */
export function isRemoteThreatened(task: RemoteMineTaskMemory, ctx: TaskContext): boolean {
    const live = ctx.world.getRoom(task.targetRoom);
    if (live && live.hostileCreeps.some(h => (h.activeParts[ATTACK] ?? 0) + (h.activeParts[RANGED_ATTACK] ?? 0) > 0)) {
        return true;
    }
    const cores = live
        ? live.structures.filter(s => s.structureType === STRUCTURE_INVADER_CORE).length
        : ctx.intel[task.targetRoom]?.invaderCores ?? 0;
    if (cores > 0) {
        return true;
    }
    const seen = ctx.intel[task.targetRoom]?.hostilesLastSeen;
    return seen !== undefined && ctx.world.tick - seen < REMOTE_THREAT_COOLDOWN;
}

/** The current road stage for this remote (see `remoteRoadStage`). */
export function roadStage(task: RemoteMineTaskMemory, ctx: TaskContext): RemoteRoadStage {
    const directive = task.directiveId ? ctx.directives[task.directiveId] : undefined;
    return remoteRoadStage({
        tick: ctx.world.tick,
        since: directive?.createdAt ?? ctx.world.tick,
        hostilesLastSeen: ctx.intel[task.targetRoom]?.hostilesLastSeen,
        reservedByMe: isReservedByMe(task, ctx),
        spareIncome: ctx.economy.incomePerTick - ctx.economy.upkeepPerTick,
    });
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

/**
 * Where a remote source's container goes: a walkable tile next to it, closest to the room's
 * center (ties broken by Manhattan distance, then scan order).
 */
export function chooseRemoteContainerTile(source: Pos, terrain: TerrainView): Pos | null {
    let best: Pos | null = null;
    let bestScore: [number, number] = [Infinity, Infinity];
    for (let y = source.y - 1; y <= source.y + 1; y++) {
        for (let x = source.x - 1; x <= source.x + 1; x++) {
            if ((x === source.x && y === source.y) || x < 1 || y < 1 || x > 48 || y > 48 || terrain.isWall(x, y)) {
                continue;
            }
            const score: [number, number] = [Math.max(Math.abs(x - 25), Math.abs(y - 25)), Math.abs(x - 25) + Math.abs(y - 25)];
            if (score[0] < bestScore[0] || (score[0] === bestScore[0] && score[1] < bestScore[1])) {
                best = { x, y, roomName: source.roomName };
                bestScore = score;
            }
        }
    }
    return best;
}

function samePos(a: Pos, b: Pos): boolean {
    return a.x === b.x && a.y === b.y && a.roomName === b.roomName;
}

function moveToRoom(creep: MyCreepSnapshot, roomName: RoomName): Intent {
    return { kind: 'move', creepName: creep.name, target: { x: 25, y: 25, roomName }, range: ROOM_CENTER_RANGE };
}

/**
 * Miners walk to their source and harvest. While the room is reserved they stand on the
 * container tile, and use their CARRY part to build the container (once full of energy) and
 * repair it when it falls below half its hits.
 */
function decideMiner(creep: MyCreepSnapshot, task: RemoteMineTaskMemory, ctx: TaskContext, reserved: boolean): Intent[] {
    const sources = remoteSources(task, ctx);
    const source = sources.find(s => s.id === creep.memory.targetId) ?? sources[0];
    if (!source) {
        return [moveToRoom(creep, task.targetRoom)];
    }
    const live = ctx.world.getRoom(task.targetRoom);
    const tile = reserved && live ? chooseRemoteContainerTile(source.pos, ctx.world.getTerrain(task.targetRoom)) : null;
    if (creep.pos.roomName !== task.targetRoom || !live) {
        return [{ kind: 'move', creepName: creep.name, target: tile ?? source.pos, range: tile ? 0 : 1 }];
    }
    if (tile && !samePos(creep.pos, tile) && !live.creepsPresent.some(c => c.name !== creep.name && samePos(c.pos, tile))) {
        return [{ kind: 'move', creepName: creep.name, target: tile, range: 0 }];
    }
    if (getRange(creep.pos, source.pos) > 1) {
        return [{ kind: 'move', creepName: creep.name, target: source.pos, range: 1 }];
    }

    const canWork = (creep.activeParts[CARRY] ?? 0) > 0 && creep.store.freeCapacity === 0;
    if (tile && canWork) {
        const site = live.constructionSites.find(s => s.structureType === STRUCTURE_CONTAINER && samePos(s.pos, tile));
        if (site) {
            return [{ kind: 'build', creepName: creep.name, targetId: site.id }];
        }
        const container = live.structures.find(s => s.structureType === STRUCTURE_CONTAINER && samePos(s.pos, tile));
        if (container && container.hits < container.hitsMax * CONTAINER_REPAIR_BELOW) {
            return [{ kind: 'repair', creepName: creep.name, targetId: container.id }];
        }
    }
    return (source.energy ?? 1) > 0 ? [{ kind: 'harvest', creepName: creep.name, targetId: source.id }] : [];
}

/** Gathers energy in the remote room (containers and drops), travelling there first. */
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
 * A hauler with WORK and energy, outside the home room, builds a nearby road site or repairs a
 * worn road as it walks (both happen alongside its move). The home room's roads are left to the
 * base's own builders and repairers.
 */
export function roadWork(creep: MyCreepSnapshot, room: RoomSnapshot | undefined, home: RoomName): Intent | null {
    if (!room || room.name === home || (creep.activeParts[WORK] ?? 0) === 0 || creep.store.energy === 0) {
        return null;
    }
    const site = findClosestByRange(creep.pos, room.constructionSites.filter(s => s.structureType === STRUCTURE_ROAD));
    if (site && getRange(creep.pos, site.pos) <= 3) {
        return { kind: 'build', creepName: creep.name, targetId: site.id };
    }
    const worn = findClosestByRange(creep.pos, room.structures.filter(s =>
        s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * ROAD_REPAIR_BELOW));
    if (worn && getRange(creep.pos, worn.pos) <= 3) {
        return { kind: 'repair', creepName: creep.name, targetId: worn.id };
    }
    return null;
}

/**
 * Mines a nearby room's sources and hauls the energy home. Miners are spawned already assigned
 * to a source (`memory.targetId`).
 * - From RESERVER_MIN_CAPACITY, a reserver keeps the room reserved, which doubles the sources'
 *   energy. While reserved, miners are bigger and build and keep up a container at each source.
 * - Roads are built in stages once the remote proves stable (see `tasks/remote_roads.ts`), along
 *   the route the base survey planned. Haulers then carry a WORK part to build and repair them.
 * - When hostiles show up (or an Invader core reserves the room), the task stops spawning and
 *   its creeps go home until the room has been clear for a while.
 */
export const remoteMineTask: TaskDefinition<RemoteMineTaskMemory> = {
    getSpawnRequests(task, ctx) {
        if (isRemoteThreatened(task, ctx)) {
            return [];
        }
        const reserved = isReservedByMe(task, ctx);
        const sources = remoteSources(task, ctx);
        const requests: SpawnRequest[] = [];
        for (const source of sources) {
            if (!ctx.creeps.some(c => c.memory.role === 'miner' && c.memory.targetId === source.id)) {
                requests.push({
                    taskName: task.name, priority: REMOTE_MINER_PRIORITY,
                    body: reserved ? RESERVED_REMOTE_MINER_BODY : REMOTE_MINER_BODY,
                    memory: { role: 'miner', targetId: source.id },
                });
            }
        }

        const haulerBody = roadStage(task, ctx) === 'none' ? REMOTE_HAULER_BODY : ROAD_HAULER_BODY;
        const carryPerHauler = (buildBody(haulerBody, ctx.home.energyCapacityAvailable) ?? [CARRY])
            .filter(p => p === CARRY).length;
        const rate = reserved ? OWNED_SOURCE_ENERGY_PER_TICK : REMOTE_SOURCE_ENERGY_PER_TICK;
        const carryNeeded = sources.reduce((sum, s) => {
            const distance = ctx.baseMemory.remoteDistances?.[s.id] ?? REMOTE_DISTANCE_ESTIMATE;
            return sum + Math.ceil(2 * distance * rate / CARRY_CAPACITY);
        }, 0);
        const haulers = ctx.creeps.filter(c => c.memory.role === 'hauler').length;
        for (let i = haulers; i < Math.ceil(carryNeeded / Math.max(1, carryPerHauler)); i++) {
            requests.push({
                taskName: task.name, priority: REMOTE_HAULER_PRIORITY - i, body: haulerBody,
                memory: { role: 'hauler' },
            });
        }

        const reservation = remoteReservation(task, ctx);
        const ticksLeft = reservation && reservation.username === ctx.world.myUsername ? reservation.ticksLeft : 0;
        if (ctx.home.energyCapacityAvailable >= RESERVER_MIN_CAPACITY && ticksLeft < RESERVATION_TOP_UP
            && !ctx.creeps.some(c => c.memory.role === 'reserver')) {
            requests.push({ taskName: task.name, priority: RESERVER_PRIORITY, body: RESERVER_BODY, memory: { role: 'reserver' } });
        }
        return requests;
    },

    decide(task, ctx) {
        const threatened = isRemoteThreatened(task, ctx);
        const reserved = isReservedByMe(task, ctx);
        const haulers = ctx.creeps.filter(c => c.memory.role === 'hauler');
        const live = ctx.world.getRoom(task.targetRoom);
        const intents: Intent[] = [];
        for (const creep of ctx.creeps) {
            if (creep.spawning) {
                continue;
            }
            if (threatened) {
                // Retreat; loaded haulers still deliver what they carry.
                if (creep.memory.role === 'hauler' && creep.store.energy > 0) {
                    intents.push(...stepToIntents(creep.name, deliverHome(ctx.home)(creep, ctx.home)));
                } else if (!isInRange(creep.pos, { x: 25, y: 25, roomName: ctx.home.name }, ROOM_CENTER_RANGE)) {
                    // Not just "in the home room": a creep left on an exit tile bounces between rooms.
                    intents.push(moveToRoom(creep, ctx.home.name));
                }
            } else if (creep.memory.role === 'miner') {
                intents.push(...decideMiner(creep, task, ctx, reserved));
            } else if (creep.memory.role === 'reserver') {
                const controller = live?.controller;
                const target = controller?.pos ?? (ctx.intel[task.targetRoom]?.controller
                    ? { x: ctx.intel[task.targetRoom].controller!.x, y: ctx.intel[task.targetRoom].controller!.y, roomName: task.targetRoom }
                    : null);
                if (controller && creep.pos.roomName === task.targetRoom) {
                    // Someone else's reservation (e.g. a destroyed Invader core's) has to be cleared first.
                    const theirs = controller.reservation && controller.reservation.username !== ctx.world.myUsername;
                    intents.push(actOrApproach(creep.pos, controller.pos, {
                        kind: theirs ? 'attackController' : 'reserveController', creepName: creep.name, targetId: controller.id,
                    }));
                } else {
                    intents.push(target ? { kind: 'move', creepName: creep.name, target, range: 1 } : moveToRoom(creep, task.targetRoom));
                }
            } else {
                intents.push(...runWorker(creep, ctx.home, gatherRemote(task, ctx, haulers), deliverHome(ctx.home)));
                const work = roadWork(creep, ctx.world.getRoom(creep.pos.roomName), ctx.home.name);
                if (work) {
                    intents.push(work);
                }
            }
        }

        if (!threatened && reserved && live) {
            // Containers: placed while reserved (the miners build and repair them).
            for (const source of live.sources) {
                const tile = chooseRemoteContainerTile(source.pos, ctx.world.getTerrain(task.targetRoom));
                const at = (s: { pos: Pos, structureType: string }) => s.structureType === STRUCTURE_CONTAINER && tile !== null && samePos(s.pos, tile);
                if (tile && !live.structures.some(at) && !live.constructionSites.some(at)) {
                    intents.push({ kind: 'createConstructionSite', pos: tile, structureType: STRUCTURE_CONTAINER });
                }
            }
        }
        const route = ctx.baseMemory.remoteRoutes?.[task.targetRoom];
        if (!threatened && route) {
            intents.push(...planRemoteRoads(route, roadStage(task, ctx), ctx.world));
        }
        return intents;
    },

    isDone(task, ctx) {
        // Ends with its directive (which `planDirectives` ends if the room becomes unusable).
        return task.directiveId === undefined || ctx.directives[task.directiveId]?.status !== 'active';
    },
};
