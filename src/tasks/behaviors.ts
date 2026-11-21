import { actOrApproach } from "intents/helpers";
import { CreepIntent, Intent } from "intents/types";
import { findClosestByRange, getRange } from "snapshot/queries";
import { MyCreepSnapshot, RoomSnapshot, SourceSnapshot, StructureSnapshot } from "snapshot/types";
import { needsRepair } from "defense/repair_targets";

/**
 * Shared creep behaviors for tasks. Each behavior is a pure function of a creep and the room it
 * works in, returning at most one action plus any memory changes.
 */

export const enum WorkerState {
    GATHERING = 0,
    WORKING = 1,
}

/** One creep's decision for this tick. */
export interface CreepStep {
    readonly action?: CreepIntent;
    readonly memory?: Partial<CreepMemory>;
}

export type Behavior = (creep: MyCreepSnapshot, room: RoomSnapshot) => CreepStep;

/** Stores must hold at least this much energy before creeps withdraw from them. */
export const MIN_STORE_WITHDRAW_ENERGY = 100;

/** Structures at or below this many hits are repaired first. */
export const CRITICAL_REPAIR_HITS = 100;

/** A container within this range of the controller is the upgraders' container. */
export const CONTROLLER_CONTAINER_RANGE = 3;

/** True for the container upgraders draw from (near the controller). */
export function isControllerContainer(structure: StructureSnapshot, room: RoomSnapshot): boolean {
    return structure.structureType === STRUCTURE_CONTAINER
        && room.controller !== null
        && getRange(structure.pos, room.controller.pos) <= CONTROLLER_CONTAINER_RANGE;
}

/** Where delivered energy goes, highest priority tier first. */
const DELIVERY_TIERS: readonly ((s: StructureSnapshot, room: RoomSnapshot) => boolean)[] = [
    s => s.owner === 'me' && (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION),
    s => s.owner === 'me' && s.structureType === STRUCTURE_TOWER,
    (s, room) => isControllerContainer(s, room),
    s => s.owner === 'me' && s.structureType === STRUCTURE_STORAGE,
];

/**
 * Runs the gather → work state machine shared by all current tasks: gather energy until full,
 * then work until empty. State changes clear the creep's remembered target.
 */
export function runWorker(creep: MyCreepSnapshot, room: RoomSnapshot, gather: Behavior, work: Behavior): Intent[] {
    if (creep.spawning) {
        return [];
    }

    const current = creep.memory.state ?? WorkerState.GATHERING;
    let next = current;
    if (current === WorkerState.GATHERING && creep.store.freeCapacity === 0) {
        next = WorkerState.WORKING;
    } else if (current === WorkerState.WORKING && creep.store.energy === 0) {
        next = WorkerState.GATHERING;
    }

    let stateChange: Partial<CreepMemory> = {};
    let view = creep;
    if (next !== current || creep.memory.state === undefined) {
        stateChange = { state: next, targetId: undefined };
        view = { ...creep, memory: { ...creep.memory, ...stateChange } };
    }

    const step = next === WorkerState.GATHERING ? gather(view, room) : work(view, room);
    return stepToIntents(creep.name, step, stateChange);
}

/** Converts a step into intents, merging any extra memory changes into a single patch. */
export function stepToIntents(creepName: string, step: CreepStep, extraMemory: Partial<CreepMemory> = {}): Intent[] {
    const intents: Intent[] = [];
    if (step.action) {
        intents.push(step.action);
    }
    const patch = { ...extraMemory, ...step.memory };
    if (Object.keys(patch).length > 0) {
        intents.push({ kind: 'setCreepMemory', creepName, patch });
    }
    return intents;
}

/** Remembers `targetId` only if it changed. */
function rememberTarget(creep: MyCreepSnapshot, targetId: Id<_HasId>): Partial<CreepMemory> | undefined {
    return creep.memory.targetId === targetId ? undefined : { targetId };
}

/**
 * Gets energy.
 * - With `fromStores`, first withdraws from ruins, then storage, then containers.
 * - Otherwise harvests: from `sourceId` if given, else the remembered source, else the source
 *   with the fewest other creeps assigned (ties broken by range).
 */
export function gatherEnergy(opts: { fromStores: boolean, sourceId?: Id<Source> }): Behavior {
    return (creep, room) => {
        if (opts.fromStores) {
            const withdraw = withdrawFromStores(creep, room);
            if (withdraw) {
                return withdraw;
            }
        }

        const source = chooseSource(creep, room, opts.sourceId);
        if (!source) {
            return {};
        }
        const memory = rememberTarget(creep, source.id);
        if (source.energy === 0) {
            // Wait next to an empty source rather than repeatedly failing to harvest.
            return getRange(creep.pos, source.pos) <= 1
                ? { memory }
                : { action: { kind: 'move', creepName: creep.name, target: source.pos, range: 1 }, memory };
        }
        return {
            action: actOrApproach(creep.pos, source.pos, { kind: 'harvest', creepName: creep.name, targetId: source.id }),
            memory,
        };
    };
}

function withdrawFromStores(creep: MyCreepSnapshot, room: RoomSnapshot): CreepStep | null {
    const ruin = findClosestByRange(creep.pos, room.ruins.filter(r => r.energy > 0));
    const hasEnergy = (s: StructureSnapshot) => (s.store?.energy ?? 0) >= MIN_STORE_WITHDRAW_ENERGY;
    const storage = room.structures.find(s => s.structureType === STRUCTURE_STORAGE && s.owner === 'me' && hasEnergy(s));
    const containers = room.structures.filter(s => s.structureType === STRUCTURE_CONTAINER && hasEnergy(s));
    const container = containers.find(s => isControllerContainer(s, room)) ?? findClosestByRange(creep.pos, containers);

    const target = ruin ?? storage ?? container;
    if (!target) {
        return null;
    }
    return {
        action: actOrApproach(creep.pos, target.pos, {
            kind: 'withdraw',
            creepName: creep.name,
            targetId: target.id as Id<Ruin | AnyStoreStructure>,
            resource: RESOURCE_ENERGY,
        }),
    };
}

function chooseSource(creep: MyCreepSnapshot, room: RoomSnapshot, sourceId?: Id<Source>): SourceSnapshot | null {
    if (sourceId) {
        return room.sources.find(s => s.id === sourceId) ?? null;
    }

    const remembered = room.sources.find(s => s.id === creep.memory.targetId);
    if (remembered && remembered.energy > 0) {
        return remembered;
    }

    const withEnergy = room.sources.filter(s => s.energy > 0);
    let best: SourceSnapshot | null = null;
    let bestScore: [number, number] = [Infinity, Infinity];
    for (const source of withEnergy) {
        const assigned = room.creepsPresent.filter(c => c.name !== creep.name && c.memory.targetId === source.id).length;
        const score: [number, number] = [assigned, getRange(creep.pos, source.pos)];
        if (score[0] < bestScore[0] || (score[0] === bestScore[0] && score[1] < bestScore[1])) {
            best = source;
            bestScore = score;
        }
    }
    return best;
}

/** Upgrades the room's controller if it's mine. */
export const upgradeController: Behavior = (creep, room) => {
    const controller = room.controller;
    if (!controller || !controller.my) {
        return {};
    }
    return {
        action: actOrApproach(creep.pos, controller.pos, { kind: 'upgrade', creepName: creep.name, targetId: controller.id }),
    };
};

function hasRoom(structure: StructureSnapshot): boolean {
    return (structure.store?.freeCapacity ?? 0) > 0;
}

/**
 * Delivers energy to spawns and extensions, then towers, then the controller container, then
 * storage, keeping the remembered target while it still has room. If nothing needs energy,
 * creeps with WORK parts upgrade the controller; others wait.
 */
export const deliverEnergy: Behavior = (creep, room) => {
    let target = room.structures.find(s =>
        s.id === creep.memory.targetId && hasRoom(s) && DELIVERY_TIERS.some(tier => tier(s, room))) ?? null;
    for (const tier of DELIVERY_TIERS) {
        if (target) {
            break;
        }
        target = findClosestByRange(creep.pos, room.structures.filter(s => tier(s, room) && hasRoom(s)));
    }
    if (!target) {
        return (creep.activeParts[WORK] ?? 0) > 0 ? upgradeController(creep, room) : {};
    }
    return {
        action: actOrApproach(creep.pos, target.pos, {
            kind: 'transfer',
            creepName: creep.name,
            targetId: target.id as Id<AnyStoreStructure>,
            resource: RESOURCE_ENERGY,
        }),
        memory: rememberTarget(creep, target.id),
    };
};

/** Builds the remembered construction site, or the closest one. Upgrades if there are none. */
export const buildNearest: Behavior = (creep, room) => {
    const site = room.constructionSites.find(s => s.id === creep.memory.targetId)
        ?? findClosestByRange(creep.pos, room.constructionSites);
    if (!site) {
        return upgradeController(creep, room);
    }
    return {
        action: actOrApproach(creep.pos, site.pos, { kind: 'build', creepName: creep.name, targetId: site.id }),
        memory: rememberTarget(creep, site.id),
    };
};

function isWall(structure: StructureSnapshot): boolean {
    return structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART;
}

/**
 * Repairs the remembered structure while it still needs it (the memory is cleared each time the
 * creep refills, so it never sticks to one wall for long). Otherwise, in order: the closest
 * critically damaged structure, the closest damaged non-wall structure, then the weakest wall or
 * rampart below its RCL target (see `defense/repair_targets.ts`). Upgrades if nothing needs repair.
 */
export const repairNearest: Behavior = (creep, room) => {
    const rcl = room.controller?.level ?? 0;
    const damaged = room.structures.filter(s => needsRepair(s, rcl));
    const walls = damaged.filter(isWall);
    const weakestWall = walls.reduce<StructureSnapshot | null>((weakest, s) => !weakest || s.hits < weakest.hits ? s : weakest, null);
    const target = damaged.find(s => s.id === creep.memory.targetId)
        ?? findClosestByRange(creep.pos, damaged.filter(s => s.hits <= CRITICAL_REPAIR_HITS))
        ?? findClosestByRange(creep.pos, damaged.filter(s => !isWall(s)))
        ?? weakestWall;
    if (!target) {
        return upgradeController(creep, room);
    }
    return {
        action: actOrApproach(creep.pos, target.pos, { kind: 'repair', creepName: creep.name, targetId: target.id }),
        memory: rememberTarget(creep, target.id),
    };
};
