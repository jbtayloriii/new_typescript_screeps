import { Intent } from "intents/types";
import { getRange } from "snapshot/queries";
import { MyCreepSnapshot, Pos, RoomSnapshot, SourceSnapshot } from "snapshot/types";
import { bodyCost, spawnTicks, ticksPerTile } from "spawning/body";
import { deliverEnergy, gatherEnergy, runWorker } from "./behaviors";
import { BodyPattern, MineTaskMemory, SpawnRequest, TaskContext, TaskDefinition, TaskMemory } from "./types";

/** 5 WORK parts harvest 10 energy/tick, all a source regenerates. Extra MOVE parts when affordable. */
export const MINER_BODY: BodyPattern = { base: [WORK, WORK, WORK, WORK, WORK, MOVE], pattern: [MOVE], maxRepeats: 2 };
export const MINER_COST = bodyCost(MINER_BODY.base!);

/** Before a miner is affordable: harvesters that walk their energy back (or park on a container). */
export const HARVESTER_BODY: BodyPattern = { pattern: [WORK, CARRY, MOVE], maxRepeats: 3 };
export const MAX_HARVESTERS_PER_SOURCE = 2;

/** With nobody at a source the base's income stops, so the first creep there outranks everything else. */
export const FIRST_MINER_PRIORITY = 105;
export const REPLACEMENT_MINER_PRIORITY = 98;
export const HARVESTER_PRIORITY = 100;

/** Source containers are placed from this RCL, like the base layout's (they cost 5000 energy). */
export const SOURCE_CONTAINER_RCL = 2;

/** Path length used when the base hasn't measured the real one yet. */
export const DEFAULT_SOURCE_DISTANCE = 25;

/** A miner has no CARRY: it only harvests, and its energy drops into the container (or onto the ground). */
export function isMiner(creep: MyCreepSnapshot): boolean {
    return (creep.activeParts[CARRY] ?? 0) === 0;
}

/**
 * True when a miner should be replaced now: its remaining life is less than the time to spawn a
 * replacement plus the replacement's walk to the source.
 */
export function isRetiring(creep: MyCreepSnapshot, distance: number): boolean {
    if (creep.ticksToLive === undefined) {
        return false;
    }
    const parts = Object.values(creep.activeParts).reduce((sum, n) => sum + (n ?? 0), 0);
    return creep.ticksToLive < spawnTicks(parts) + distance * ticksPerTile(creep.activeParts);
}

/** The container tile as a position in the source's room, if the task has one. */
function tileOf(task: MineTaskMemory, source: SourceSnapshot): Pos | null {
    return task.containerTile ? { x: task.containerTile.x, y: task.containerTile.y, roomName: source.pos.roomName } : null;
}

function samePos(a: Pos, b: Pos): boolean {
    return a.x === b.x && a.y === b.y && a.roomName === b.roomName;
}

function hasContainerAt(room: RoomSnapshot, tile: Pos): boolean {
    return room.structures.some(s => s.structureType === STRUCTURE_CONTAINER && samePos(s.pos, tile));
}

/**
 * True when this source's energy has to be carried away by haulers: a container exists at its
 * tile (harvesters may park on it), or a miner works it.
 */
export function needsHauling(task: MineTaskMemory, home: RoomSnapshot): boolean {
    const source = home.sources.find(s => s.id === task.sourceId);
    const tile = source && tileOf(task, source);
    return (tile !== null && tile !== undefined && hasContainerAt(home, tile))
        || home.creepsPresent.some(c => c.memory.taskName === task.name && isMiner(c));
}

/** True if any of the base's haul task creeps is in the room and not spawning. */
function hasHauler(baseTasks: readonly TaskMemory[], home: RoomSnapshot): boolean {
    const haulTasks = new Set(baseTasks.filter(t => t.type === 'haul').map(t => t.name));
    return home.creepsPresent.some(c => haulTasks.has(c.memory.taskName) && !c.spawning);
}

/** Moves a parked creep to its tile (or beside the source if the tile is taken), then harvests. */
function parkAndHarvest(creep: MyCreepSnapshot, source: SourceSnapshot, tile: Pos | null, ctx: TaskContext): Intent[] {
    // A retiring creep may still hold the tile; its replacement mines from beside it.
    const tileTaken = tile !== null && ctx.home.creepsPresent.some(o => o.name !== creep.name && samePos(o.pos, tile));
    const standAt = tile && !tileTaken ? tile : null;
    if (standAt && !samePos(creep.pos, standAt)) {
        return [{ kind: 'move', creepName: creep.name, target: standAt, range: 0 }];
    }
    if (!standAt && getRange(creep.pos, source.pos) > 1) {
        return [{ kind: 'move', creepName: creep.name, target: source.pos, range: 1 }];
    }
    return source.energy > 0 ? [{ kind: 'harvest', creepName: creep.name, targetId: source.id }] : [];
}

/**
 * Everything to do with one of the base's own sources, adapting as the base grows:
 *
 * - **Before a miner is affordable** (energy capacity < 550): up to 2 harvesters, never more than
 *   the source has open tiles. They harvest and walk the energy back. Once the source's container
 *   exists and the base has a hauler, one harvester parks on the container and keeps harvesting:
 *   a full creep drops the extra into the container under it, for haulers to take.
 * - **Once a miner is affordable**: one miner (`5×WORK + MOVE`) parked on the container tile,
 *   replaced early before it dies. When a miner is working, the task releases its harvesters
 *   (they become orphans and are adopted, e.g. as haulers).
 * - **On collapse** (no creeps here and not enough energy for a miner): one urgent harvester to
 *   recover with.
 *
 * The container is an optimization, not a requirement: without it the miner drop mines. If it's
 * missing (from RCL 2), the task places its construction site right away.
 */
export const mineTask: TaskDefinition<MineTaskMemory> = {
    getSpawnRequests(task, ctx) {
        const source = ctx.home.sources.find(s => s.id === task.sourceId);
        if (!source) {
            return [];
        }
        const harvester = (i: number): SpawnRequest => ({
            taskName: task.name,
            priority: HARVESTER_PRIORITY - 10 * i,
            body: HARVESTER_BODY,
            // Without anyone harvesting, the base can't refill, so spawn whatever is affordable now.
            urgent: i === 0,
        });

        if (ctx.home.energyCapacityAvailable >= MINER_COST) {
            const distance = ctx.baseMemory.sourceDistances?.[task.sourceId] ?? DEFAULT_SOURCE_DISTANCE;
            const miners = ctx.creeps.filter(isMiner);
            if (miners.some(c => !isRetiring(c, distance))) {
                return [];
            }
            const harvesters = ctx.creeps.filter(c => !isMiner(c));
            if (miners.length === 0 && harvesters.length === 0 && ctx.home.energyAvailable < MINER_COST) {
                return [harvester(0)];
            }
            const nobodyWorking = miners.length === 0 && harvesters.length === 0;
            return [{
                taskName: task.name,
                priority: nobodyWorking ? FIRST_MINER_PRIORITY : REPLACEMENT_MINER_PRIORITY,
                body: MINER_BODY,
            }];
        }

        const requests: SpawnRequest[] = [];
        for (let i = ctx.creeps.length; i < Math.min(MAX_HARVESTERS_PER_SOURCE, source.openSpots); i++) {
            requests.push(harvester(i));
        }
        return requests;
    },

    decide(task, ctx) {
        const source = ctx.home.sources.find(s => s.id === task.sourceId);
        if (!source) {
            return [];
        }
        const tile = tileOf(task, source);
        const container = tile !== null && hasContainerAt(ctx.home, tile);
        const minerWorking = ctx.creeps.some(c => isMiner(c) && !c.spawning);
        const harvesters = ctx.creeps.filter(c => !isMiner(c) && !c.spawning);
        // The harvester that parks on the container: whoever is on the tile, else the first one.
        const parked = (tile && harvesters.find(c => samePos(c.pos, tile))) ?? harvesters[0];
        const canPark = container && hasHauler(ctx.baseTasks, ctx.home);
        const walk = gatherEnergy({ fromStores: false, sourceId: source.id });
        const intents: Intent[] = [];

        for (const creep of ctx.creeps) {
            if (creep.spawning) {
                continue;
            }
            if (isMiner(creep)) {
                intents.push(...parkAndHarvest(creep, source, tile, ctx));
            } else if (minerWorking) {
                intents.push({ kind: 'setCreepMemory', creepName: creep.name, patch: { taskName: '' } });
            } else if (creep === parked && canPark) {
                intents.push(...parkAndHarvest(creep, source, tile, ctx));
            } else {
                intents.push(...runWorker(creep, ctx.home, walk, deliverEnergy));
            }
        }

        if (tile && !container && (ctx.home.controller?.level ?? 0) >= SOURCE_CONTAINER_RCL) {
            const at = (s: { pos: Pos, structureType: string }) => s.structureType === STRUCTURE_CONTAINER && samePos(s.pos, tile);
            if (!ctx.home.constructionSites.some(at)) {
                intents.push({ kind: 'createConstructionSite', pos: tile, structureType: STRUCTURE_CONTAINER });
            }
        }
        return intents;
    },

    isDone(task, ctx) {
        return !ctx.home.sources.some(s => s.id === task.sourceId);
    },
};
