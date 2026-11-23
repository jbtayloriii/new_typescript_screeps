import { findClosestByRange } from "snapshot/queries";
import { MyCreepSnapshot, Pos } from "snapshot/types";
import { buildBody } from "spawning/body";
import { actOrApproach } from "intents/helpers";
import { Behavior, deliverEnergy, isControllerContainer, runWorker, WorkerState } from "./behaviors";
import { DEFAULT_SOURCE_DISTANCE, needsHauling } from "./mine_task";
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
 * Haulers needed to carry every mine task's output: for each source, the energy produced during
 * one round trip, divided by one hauler's capacity (sized to the room's energy capacity).
 */
export function desiredHaulerCount(ctx: TaskContext): number {
    // Only sources whose energy waits to be collected: harvesters still walking theirs home don't count.
    const mines = ctx.baseTasks.filter((t): t is MineTaskMemory => t.type === 'mine' && needsHauling(t, ctx.home));
    if (mines.length === 0) {
        return 0;
    }
    let carryNeeded = 0;
    for (const mine of mines) {
        const distance = ctx.baseMemory.sourceDistances?.[mine.sourceId] ?? DEFAULT_SOURCE_DISTANCE;
        const roundTrip = 2 * distance + TRIP_OVERHEAD_TICKS;
        carryNeeded += Math.ceil(roundTrip * OWNED_SOURCE_ENERGY_PER_TICK / CARRY_CAPACITY);
    }
    const carryPerHauler = (buildBody(HAULER_BODY, ctx.home.energyCapacityAvailable) ?? [CARRY])
        .filter(p => p === CARRY).length;
    return Math.max(1, Math.min(2 * mines.length + 1, Math.ceil(carryNeeded / carryPerHauler)));
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
 * towers, then the controller container, then storage. Sized to the base's mine tasks.
 */
export const haulTask: TaskDefinition<HaulTaskMemory> = {
    getSpawnRequests(task, ctx) {
        const requests: SpawnRequest[] = [];
        for (let i = ctx.creeps.length; i < desiredHaulerCount(ctx); i++) {
            requests.push({
                taskName: task.name,
                priority: i === 0 ? FIRST_HAULER_PRIORITY : EXTRA_HAULER_PRIORITY - i,
                body: HAULER_BODY,
                // Without a hauler nothing refills the spawn, so take what's affordable now.
                urgent: i === 0,
            });
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
