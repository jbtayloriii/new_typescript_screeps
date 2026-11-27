import { findClosestByRange, getRange } from "snapshot/queries";
import { MyCreepSnapshot, Pos, RoomSnapshot } from "snapshot/types";
import { buildBody } from "spawning/body";
import { actOrApproach } from "intents/helpers";
import { Behavior, deliverEnergy, isControllerContainer, runWorker, WorkerState } from "./behaviors";
import { DEFAULT_SOURCE_DISTANCE, isRetiring, needsHauling } from "./mine_task";
import { OWNED_SOURCE_ENERGY_PER_TICK } from "./economy";
import { BodyPattern, HaulTaskMemory, MineTaskMemory, SpawnRequest, TaskContext, TaskDefinition } from "./types";

export const HAULER_BODY: BodyPattern = { pattern: [CARRY, MOVE], maxRepeats: 16 };

/** Energy only reaches the spawn through haulers once mining is static. */
export const FIRST_HAULER_PRIORITY = 100;
export const EXTRA_HAULER_PRIORITY = 90;

/** Ignore piles smaller than this, so haulers don't make trips for scraps. */
export const MIN_PICKUP = 50;

/** Extra ticks per round trip for picking up and dropping off. */
const TRIP_OVERHEAD_TICKS = 4;

/**
 * A mine whose container and drops hold at least this much energy is falling behind, so the base
 * asks for one more hauler's worth of CARRY (see `haulCarryNeeded`).
 */
export const HAUL_BACKLOG = 1500;

/** Mine tasks whose energy waits to be collected: harvesters still walking theirs home don't count. */
function haulingMines(ctx: TaskContext): MineTaskMemory[] {
    return ctx.baseTasks.filter((t): t is MineTaskMemory => t.type === 'mine' && needsHauling(t, ctx.home));
}

/** CARRY parts in one full-size hauler (sized to the room's energy capacity). */
function carryPerHauler(ctx: TaskContext): number {
    return (buildBody(HAULER_BODY, ctx.home.energyCapacityAvailable) ?? [CARRY]).filter(p => p === CARRY).length;
}

/** Energy waiting at a mine: its container plus energy dropped next to the source. */
export function mineBacklog(mine: MineTaskMemory, home: RoomSnapshot): number {
    const source = home.sources.find(s => s.id === mine.sourceId);
    if (!source) {
        return 0;
    }
    const tile = mine.containerTile;
    const container = tile && home.structures.find(s =>
        s.structureType === STRUCTURE_CONTAINER && s.pos.x === tile.x && s.pos.y === tile.y);
    const dropped = home.droppedResources
        .filter(d => d.resourceType === RESOURCE_ENERGY && getRange(d.pos, source.pos) <= 1)
        .reduce((sum, d) => sum + d.amount, 0);
    return (container?.store?.energy ?? 0) + dropped;
}

/**
 * CARRY parts needed to carry every mine task's output: for each source, the energy produced
 * during one round trip from the spawn. Haulers also stop at many extensions, towers and the
 * controller container, which this doesn't count, so while any mine has HAUL_BACKLOG energy
 * waiting, one more hauler's worth is added. The backlog check corrects the estimate.
 */
export function haulCarryNeeded(ctx: TaskContext): number {
    const mines = haulingMines(ctx);
    let carryNeeded = 0;
    for (const mine of mines) {
        const distance = ctx.baseMemory.sourceDistances?.[mine.sourceId] ?? DEFAULT_SOURCE_DISTANCE;
        const roundTrip = 2 * distance + TRIP_OVERHEAD_TICKS;
        carryNeeded += Math.ceil(roundTrip * OWNED_SOURCE_ENERGY_PER_TICK / CARRY_CAPACITY);
    }
    if (mines.some(m => mineBacklog(m, ctx.home) >= HAUL_BACKLOG)) {
        carryNeeded += carryPerHauler(ctx);
    }
    return carryNeeded;
}

/** At most 2 haulers per source that needs hauling, plus 1. */
export function maxHaulers(ctx: TaskContext): number {
    return 2 * haulingMines(ctx).length + 1;
}

/** A pile of energy a hauler can collect from: a dropped resource or a (non-controller) container. */
interface EnergyPile {
    readonly id: Id<Resource> | Id<StructureContainer>;
    readonly pos: Pos;
    readonly amount: number;
    readonly kind: 'drop' | 'container';
}

/**
 * Shares the piles between gathering haulers in one pass, in a fixed order (by name):
 * 1. Each hauler keeps its remembered pile while energy is left after the haulers before it.
 * 2. The rest (in this room) take the pile with the most energy left, closest first.
 * Haulers left over get nothing and wait.
 *
 * Every hauler computes the same assignment from the same inputs, so they agree. Each choosing
 * on its own from last tick's targets made them all switch piles together when the piles ran
 * low, then all switch back the next tick, forever (seen in W24S31 room history).
 */
function assignPiles(gatherers: readonly MyCreepSnapshot[], piles: readonly EnergyPile[], roomName: RoomName): Map<string, EnergyPile> {
    const left = new Map(piles.map(p => [p.id as string, p.amount]));
    const assigned = new Map<string, EnergyPile>();
    const claim = (hauler: MyCreepSnapshot, pile: EnergyPile) => {
        assigned.set(hauler.name, pile);
        left.set(pile.id, left.get(pile.id)! - hauler.store.freeCapacity);
    };

    const choosing: MyCreepSnapshot[] = [];
    for (const hauler of [...gatherers].sort((a, b) => a.name.localeCompare(b.name))) {
        const kept = piles.find(p => p.id === hauler.memory.targetId);
        if (kept && left.get(kept.id)! > 0) {
            claim(hauler, kept);
        } else if (hauler.pos.roomName === roomName) {
            choosing.push(hauler);
        }
    }
    for (const hauler of choosing) {
        const best = Math.max(0, ...piles.map(p => left.get(p.id)!));
        const target = best > 0 ? findClosestByRange(hauler.pos, piles.filter(p => left.get(p.id) === best)) : null;
        if (target) {
            claim(hauler, target);
        }
    }
    return assigned;
}

/** Collects from the pile `assignPiles` gives this hauler, sharing piles with the other gathering haulers. */
export function collectEnergy(haulers: readonly MyCreepSnapshot[]): Behavior {
    return (creep, room) => {
        const piles: EnergyPile[] = [
            ...room.droppedResources
                .filter(d => d.resourceType === RESOURCE_ENERGY && d.amount >= MIN_PICKUP)
                .map(d => ({ id: d.id, pos: d.pos, amount: d.amount, kind: 'drop' as const })),
            ...room.structures
                .filter(s => s.structureType === STRUCTURE_CONTAINER && !isControllerContainer(s, room) && (s.store?.energy ?? 0) >= MIN_PICKUP)
                .map(s => ({ id: s.id as Id<StructureContainer>, pos: s.pos, amount: s.store!.energy, kind: 'container' as const })),
        ];
        // `creep` may have just switched to gathering (and had its target cleared), so use it, not its entry in `haulers`.
        const gatherers = [creep, ...haulers.filter(h => h.name !== creep.name && h.memory.state === WorkerState.GATHERING)];
        const target = assignPiles(gatherers, piles, room.name).get(creep.name);
        if (!target) {
            return {};
        }
        const action = target.kind === 'drop'
            ? actOrApproach(creep.pos, target.pos, { kind: 'pickup', creepName: creep.name, targetId: target.id as Id<Resource> })
            : actOrApproach(creep.pos, target.pos, {
                kind: 'withdraw', creepName: creep.name, targetId: target.id as Id<StructureContainer>, resource: RESOURCE_ENERGY,
            });
        return { action, memory: creep.memory.targetId === target.id ? undefined : { targetId: target.id } };
    };
}

/**
 * Carries energy from source containers and dropped energy to spawns and extensions, then
 * towers, then the controller container, then storage. Sized in CARRY parts to the base's mine
 * tasks (see `haulCarryNeeded`), so an undersized hauler gets help.
 */
export const haulTask: TaskDefinition<HaulTaskMemory> = {
    getSpawnRequests(task, ctx) {
        const needed = haulCarryNeeded(ctx);
        // A retiring hauler is replaced before it dies, so the replacement isn't an urgent,
        // undersized one spawned from whatever energy is left once nobody refills the spawn.
        const working = ctx.creeps.filter(c => !isRetiring(c, 0));
        let carry = working.reduce((sum, c) => sum + (c.activeParts[CARRY] ?? 0), 0);
        const requests: SpawnRequest[] = [];
        for (let i = working.length; i < maxHaulers(ctx) && carry < needed; i++) {
            requests.push({
                taskName: task.name,
                priority: i === 0 ? FIRST_HAULER_PRIORITY : EXTRA_HAULER_PRIORITY - i,
                body: HAULER_BODY,
                // Without any hauler nothing refills the spawn, so take what's affordable now.
                urgent: i === 0 && ctx.creeps.length === 0,
            });
            carry += carryPerHauler(ctx);
        }
        return requests;
    },

    decide(task, ctx) {
        const collect = collectEnergy(ctx.creeps);
        return ctx.creeps.flatMap(creep => runWorker(creep, ctx.home, collect, deliverEnergy));
    },

    isDone() {
        return false;
    },
};
