import { decideSafeMode } from "defense/safe_mode";
import { decideTowerIntents } from "defense/tower_logic";
import { IntelMap } from "intel/types";
import { DirectiveMap } from "directives/types";
import { Intent } from "intents/types";
import { MyCreepSnapshot, RoomSnapshot } from "snapshot/types";
import { WorldSnapshot } from "snapshot/world";
import { planSpawnQueue } from "spawning/plan_spawns";
import { BaseReport, buildBaseReport } from "./base_report";
import { assignOrphans, decideRecycle, groupCreepsByTask } from "tasks/creep_assignment";
import { computeEconomy } from "tasks/economy";
import { getTaskDefinition } from "tasks/registry";
import { planTasks, TaskChanges } from "tasks/task_planning";
import { EconomySummary, SpawnRequest, TaskContext, TaskMemory } from "tasks/types";
import { planConstruction } from "./construction";

/**
 * Pure decision steps for one base's tick. `Base` applies the results to Memory and the game.
 */

export interface BaseTickInput {
    readonly world: WorldSnapshot;
    readonly home: RoomSnapshot;
    readonly baseMemory: Readonly<BaseMemory>;
    readonly tasks: readonly TaskMemory[];
    /** Creeps owned by this base (`memory.baseRoomName`), wherever they are. */
    readonly creeps: readonly MyCreepSnapshot[];
    readonly intel: IntelMap;
    /** All directives (the base runs the active ones assigned to it). */
    readonly directives: DirectiveMap;
}

type ByTask = ReadonlyMap<string, readonly MyCreepSnapshot[]>;

function contextFor(input: BaseTickInput, economy: EconomySummary, creeps: readonly MyCreepSnapshot[]): TaskContext {
    return {
        world: input.world,
        home: input.home,
        creeps,
        baseMemory: input.baseMemory,
        baseTasks: input.tasks,
        economy,
        intel: input.intel,
        directives: input.directives,
    };
}

/**
 * Decides which tasks to remove and create: finished or unknown tasks go, then `planTasks` adds
 * missing ones (see `planTasks`).
 */
export function reconcileTasks(input: BaseTickInput): TaskChanges {
    const { byTask } = groupCreepsByTask(input.creeps, input.tasks.map(t => t.name));
    const economy = computeEconomy(input.tasks, byTask);
    const finished: string[] = [];
    const kept: TaskMemory[] = [];
    for (const task of input.tasks) {
        const definition = getTaskDefinition(task);
        if (!definition || definition.isDone(task, contextFor(input, economy, byTask.get(task.name) ?? []))) {
            finished.push(task.name);
        } else {
            kept.push(task);
        }
    }
    const assigned = Object.values(input.directives)
        .filter(d => d.status === 'active' && d.baseRoomName === input.home.name);
    const planned = planTasks({ ...input, tasks: kept, creepsByTask: byTask, directives: assigned });
    return { remove: [...finished, ...planned.remove], create: planned.create };
}

export interface BaseTickPlan {
    readonly intents: Intent[];
    readonly baseMemoryUpdate: Partial<BaseMemory>;
    /** Only when asked for (visuals on for the room). */
    readonly report?: BaseReport;
}

/**
 * Decides everything the base does this tick, in order:
 * 1. Assign orphaned creeps to tasks (or recycle them).
 * 2. Spawn creeps for the highest-priority open requests.
 * 3. Each task directs its creeps.
 * 4. Safe mode if the base is overrun; towers defend, heal and repair.
 * 5. Construction sites are placed from the base layout.
 *
 * Assumes `tasks` were already reconciled this tick (see `reconcileTasks`).
 */
export function decideBaseIntents(input: BaseTickInput, opts: { report?: boolean } = {}): BaseTickPlan {
    const { home, tasks } = input;
    const intents: Intent[] = [];

    const grouped = groupCreepsByTask(input.creeps, tasks.map(t => t.name));
    const economy = computeEconomy(tasks, grouped.byTask);
    const requestsFor = (byTask: ByTask): SpawnRequest[] => tasks.flatMap(task => {
        const definition = getTaskDefinition(task);
        return definition ? definition.getSpawnRequests(task, contextFor(input, economy, byTask.get(task.name) ?? [])) : [];
    });

    // 1. Assign orphans, preferring tasks waiting on a spawn; upgrading takes any WORK + CARRY creep.
    const upgrade = tasks.find(t => t.type === 'upgrade');
    const fallback = upgrade && {
        taskName: upgrade.name,
        canTake: (c: MyCreepSnapshot) => (c.activeParts[WORK] ?? 0) > 0 && (c.activeParts[CARRY] ?? 0) > 0,
    };
    const resolved = assignOrphans(grouped.orphans, grouped.byTask, requestsFor, fallback);
    for (const { creep, patch } of resolved.assignments) {
        intents.push({ kind: 'setCreepMemory', creepName: creep.name, patch });
    }
    for (const creep of resolved.unassigned) {
        intents.push(...decideRecycle(creep, home));
    }

    // 2. Spawn.
    const requests = requestsFor(resolved.byTask);
    const spawnPlan = planSpawnQueue(home, requests);
    intents.push(...spawnPlan.intents);

    // 3. Tasks direct their creeps.
    for (const task of tasks) {
        const definition = getTaskDefinition(task);
        if (definition) {
            intents.push(...definition.decide(task, contextFor(input, economy, resolved.byTask.get(task.name) ?? [])));
        }
    }

    // 4. Defense.
    intents.push(...decideSafeMode(home));
    intents.push(...decideTowerIntents(home));

    // 5. Construction.
    const construction = planConstruction(home, input.baseMemory);
    intents.push(...construction.intents);

    const report = opts.report ? buildBaseReport({
        home,
        tasks,
        byTask: resolved.byTask,
        economy,
        requests,
        spawnPlan,
        contextFor: task => contextFor(input, economy, resolved.byTask.get(task.name) ?? []),
    }) : undefined;

    return { intents: dedupeConstructionSites(intents), baseMemoryUpdate: construction.memoryUpdate, report };
}

/** Drops repeated construction site intents for the same spot (e.g. a mine task and the layout both placing a container). */
function dedupeConstructionSites(intents: Intent[]): Intent[] {
    const seen = new Set<string>();
    return intents.filter(intent => {
        if (intent.kind !== 'createConstructionSite') {
            return true;
        }
        const key = `${intent.pos.roomName}_${intent.pos.x}_${intent.pos.y}_${intent.structureType}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
