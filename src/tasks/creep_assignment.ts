import { Intent } from "intents/types";
import { findClosestByRange, getMyStructures, getRange } from "snapshot/queries";
import { MyCreepSnapshot, RoomSnapshot } from "snapshot/types";
import { SpawnRequest } from "./types";
import { countParts, minimalBody } from "spawning/body";

/**
 * Creep ↔ task assignment. The only saved link is `creep.memory.taskName`; these functions
 * rebuild each task's creep list from it every tick.
 */

export interface CreepGroups {
    readonly byTask: ReadonlyMap<string, readonly MyCreepSnapshot[]>;
    /** Creeps whose `taskName` matches none of the given tasks. */
    readonly orphans: readonly MyCreepSnapshot[];
}

/**
 * Groups creeps by task name. Spawning creeps are included, so a task counts them right away
 * and doesn't request duplicates. Dead creeps aren't in the input, so they simply drop out.
 */
export function groupCreepsByTask(creeps: readonly MyCreepSnapshot[], taskNames: readonly string[]): CreepGroups {
    const byTask = new Map<string, MyCreepSnapshot[]>(taskNames.map(name => [name, []]));
    const orphans: MyCreepSnapshot[] = [];
    for (const creep of creeps) {
        const group = byTask.get(creep.memory.taskName);
        if (group) {
            group.push(creep);
        } else {
            orphans.push(creep);
        }
    }
    return { byTask, orphans };
}

/**
 * True if the creep has at least the request's minimal body (e.g. a 1-WORK harvester can fill a
 * hauler request, but not a 5-WORK miner request).
 */
export function canFillRequest(creep: MyCreepSnapshot, request: SpawnRequest): boolean {
    return Object.entries(countParts(minimalBody(request.body)))
        .every(([part, count]) => (creep.activeParts[part as BodyPartConstant] ?? 0) >= (count ?? 0));
}

/** A task orphans join when no open request fits them, if they can do its work. */
export interface OrphanFallback {
    readonly taskName: string;
    readonly canTake: (creep: MyCreepSnapshot) => boolean;
}

export interface OrphanAssignment {
    readonly creep: MyCreepSnapshot;
    readonly taskName: string;
    /** The memory change to apply to the creep. */
    readonly patch: Partial<CreepMemory>;
}

export interface OrphanResolution {
    /** Groups including the adopted creeps (with their memory updated to the new task). */
    readonly byTask: ReadonlyMap<string, readonly MyCreepSnapshot[]>;
    readonly assignments: readonly OrphanAssignment[];
    /** Orphans no task could take; these should be recycled. */
    readonly unassigned: readonly MyCreepSnapshot[];
}

/**
 * Gives orphans to tasks. Each orphan fills the highest-priority open spawn request its body can
 * handle (saving a spawn, and taking the request's initial memory), otherwise joins the fallback
 * task if it can do that work, otherwise is unassigned.
 *
 * `getOpenRequests` is re-evaluated after every adoption, so one orphan doesn't satisfy a
 * request that another orphan already filled.
 */
export function assignOrphans(
    orphans: readonly MyCreepSnapshot[],
    byTask: ReadonlyMap<string, readonly MyCreepSnapshot[]>,
    getOpenRequests: (byTask: ReadonlyMap<string, readonly MyCreepSnapshot[]>) => readonly SpawnRequest[],
    fallback?: OrphanFallback): OrphanResolution {
    const groups = new Map<string, MyCreepSnapshot[]>([...byTask].map(([name, creeps]) => [name, [...creeps]]));
    const assignments: OrphanAssignment[] = [];
    const unassigned: MyCreepSnapshot[] = [];

    for (const orphan of orphans) {
        const requests = [...getOpenRequests(groups)].sort((a, b) => b.priority - a.priority);
        const request = requests.find(r => canFillRequest(orphan, r));
        let taskName: string | undefined;
        let patch: Partial<CreepMemory> | undefined;
        if (request) {
            taskName = request.taskName;
            patch = { ...assignmentPatch(taskName), ...request.memory };
        } else if (fallback && groups.has(fallback.taskName) && fallback.canTake(orphan)) {
            taskName = fallback.taskName;
            patch = assignmentPatch(taskName);
        }
        if (!taskName || !patch) {
            unassigned.push(orphan);
            continue;
        }
        const adopted = { ...orphan, memory: { ...orphan.memory, ...patch } };
        groups.get(taskName)!.push(adopted);
        assignments.push({ creep: orphan, taskName, patch });
    }
    return { byTask: groups, assignments, unassigned };
}

/** The memory change that moves a creep to a task, resetting its state for the new task. */
export function assignmentPatch(taskName: string): Partial<CreepMemory> {
    return { taskName, state: undefined, targetId: undefined, role: undefined, targetRoom: undefined };
}

/** Walks the creep to the closest spawn in its base and recycles it there. */
export function decideRecycle(creep: MyCreepSnapshot, home: RoomSnapshot): Intent[] {
    if (creep.spawning) {
        return [];
    }
    const spawn = findClosestByRange(creep.pos, getMyStructures(home, STRUCTURE_SPAWN));
    if (!spawn) {
        return [];
    }
    if (getRange(creep.pos, spawn.pos) <= 1) {
        return [{ kind: 'recycle', spawnId: spawn.id as Id<StructureSpawn>, creepName: creep.name }];
    }
    return [{ kind: 'move', creepName: creep.name, target: spawn.pos, range: 1 }];
}
