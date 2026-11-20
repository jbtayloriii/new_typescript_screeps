import { decideTowerIntents } from "defense/tower_logic";
import { Intent } from "intents/types";
import { MyCreepSnapshot, RoomSnapshot } from "snapshot/types";
import { WorldSnapshot } from "snapshot/world";
import { planSpawns } from "spawning/plan_spawns";
import { assignmentPatch, assignOrphans, decideRecycle, groupCreepsByTask } from "tasks/creep_assignment";
import { getTaskDefinition } from "tasks/registry";
import { planTasks } from "tasks/task_planning";
import { SpawnRequest, TaskContext, TaskMemory, TaskSpec } from "tasks/types";
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
}

export interface TaskChanges {
    /** Names of finished tasks, and tasks with an unknown type. */
    readonly remove: readonly string[];
    readonly create: readonly TaskSpec[];
}

/** Decides which tasks to remove (finished or unknown) and which to create (missing). */
export function reconcileTasks(input: Omit<BaseTickInput, 'baseMemory'>): TaskChanges {
    const { byTask } = groupCreepsByTask(input.creeps, input.tasks.map(t => t.name));
    const remove: string[] = [];
    const kept: TaskMemory[] = [];
    for (const task of input.tasks) {
        const definition = getTaskDefinition(task);
        const ctx = taskContext(input, byTask.get(task.name) ?? []);
        if (!definition || definition.isDone(task, ctx)) {
            remove.push(task.name);
        } else {
            kept.push(task);
        }
    }
    return { remove, create: planTasks(input.home, kept) };
}

export interface BaseTickPlan {
    readonly intents: Intent[];
    readonly baseMemoryUpdate: Partial<BaseMemory>;
}

/**
 * Decides everything the base does this tick, in order:
 * 1. Assign orphaned creeps to tasks (or recycle them).
 * 2. Spawn creeps for the highest-priority open requests.
 * 3. Each task directs its creeps.
 * 4. Towers defend and repair.
 * 5. Construction sites are placed from the base layout.
 *
 * Assumes `tasks` were already reconciled this tick (see `reconcileTasks`).
 */
export function decideBaseIntents(input: BaseTickInput): BaseTickPlan {
    const { home, tasks } = input;
    const intents: Intent[] = [];

    // 1. Assign orphans, preferring tasks that are waiting on a spawn.
    const grouped = groupCreepsByTask(input.creeps, tasks.map(t => t.name));
    const fallback = tasks.find(t => t.type === 'upgrade')?.name;
    const resolved = assignOrphans(grouped.orphans, grouped.byTask, byTask => collectSpawnRequests(input, byTask), fallback);
    for (const { creep, taskName } of resolved.assignments) {
        intents.push({ kind: 'setCreepMemory', creepName: creep.name, patch: assignmentPatch(taskName) });
    }
    for (const creep of resolved.unassigned) {
        intents.push(...decideRecycle(creep, home));
    }

    // 2. Spawn.
    intents.push(...planSpawns(home, collectSpawnRequests(input, resolved.byTask)));

    // 3. Tasks direct their creeps.
    for (const task of tasks) {
        const definition = getTaskDefinition(task);
        if (definition) {
            intents.push(...definition.decide(task, taskContext(input, resolved.byTask.get(task.name) ?? [])));
        }
    }

    // 4. Towers.
    intents.push(...decideTowerIntents(home));

    // 5. Construction.
    const construction = planConstruction(home, input.baseMemory);
    intents.push(...construction.intents);

    return { intents, baseMemoryUpdate: construction.memoryUpdate };
}

function collectSpawnRequests(
    input: Omit<BaseTickInput, 'baseMemory'>,
    byTask: ReadonlyMap<string, readonly MyCreepSnapshot[]>): SpawnRequest[] {
    return input.tasks.flatMap(task => {
        const definition = getTaskDefinition(task);
        return definition ? definition.getSpawnRequests(task, taskContext(input, byTask.get(task.name) ?? [])) : [];
    });
}

function taskContext(input: Omit<BaseTickInput, 'baseMemory'>, creeps: readonly MyCreepSnapshot[]): TaskContext {
    return { world: input.world, home: input.home, creeps };
}
