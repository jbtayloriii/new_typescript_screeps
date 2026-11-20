import { Intent } from "intents/types";
import { MyCreepSnapshot, RoomSnapshot } from "snapshot/types";
import { WorldSnapshot } from "snapshot/world";

/**
 * A task is a single goal (harvest a source, upgrade the controller, ...) that owns some
 * creeps. It is made of:
 * - Saved state: a `TaskMemory` entry in `Memory.tasks[baseRoomName]`.
 * - Behavior: a stateless `TaskDefinition` for its type (see `tasks/registry.ts`).
 *
 * Tasks never store their creeps; each tick the base hands every task the creeps whose
 * `memory.taskName` matches.
 */

export type TaskType = 'harvest' | 'upgrade' | 'build' | 'repair';

interface TaskMemoryBase {
    /** Unique name, e.g. "W1N1_harvest_3". Creeps refer to their task by this name. */
    readonly name: string;
    /** The base that owns this task. */
    readonly roomName: RoomName;
}

export interface HarvestTaskMemory extends TaskMemoryBase {
    readonly type: 'harvest';
    readonly sourceId: Id<Source>;
}

export interface UpgradeTaskMemory extends TaskMemoryBase {
    readonly type: 'upgrade';
}

export interface BuildTaskMemory extends TaskMemoryBase {
    readonly type: 'build';
}

export interface RepairTaskMemory extends TaskMemoryBase {
    readonly type: 'repair';
}

export type TaskMemory = HarvestTaskMemory | UpgradeTaskMemory | BuildTaskMemory | RepairTaskMemory;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** What's needed to create a task; the name and room are filled in when it is saved. */
export type TaskSpec = DistributiveOmit<TaskMemory, 'name' | 'roomName'>;

/** A repeating body pattern, e.g. [WORK, CARRY, MOVE] repeated up to 3 times. */
export interface BodyPattern {
    readonly pattern: readonly BodyPartConstant[];
    readonly maxRepeats: number;
}

export interface SpawnRequest {
    readonly taskName: string;
    /** Higher spawns first. */
    readonly priority: number;
    readonly body: BodyPattern;
    /**
     * Size the body to the energy available now instead of waiting for full capacity. Use for
     * creeps the base can't recover without (e.g. the first harvester).
     */
    readonly urgent?: boolean;
}

export interface TaskContext {
    readonly world: WorldSnapshot;
    /** The task's base room. */
    readonly home: RoomSnapshot;
    /** This task's creeps (including ones still spawning), wherever they are. */
    readonly creeps: readonly MyCreepSnapshot[];
}

/** The behavior of one task type. All functions are pure: they read state and return decisions. */
export interface TaskDefinition<T extends TaskMemory = TaskMemory> {
    /** Creeps this task still wants. Return one request per missing creep. */
    getSpawnRequests(task: T, ctx: TaskContext): SpawnRequest[];
    /** Intents for this task's creeps this tick (including `setCreepMemory` for state changes). */
    decide(task: T, ctx: TaskContext): Intent[];
    /** True when the task is finished and should be removed. Its creeps become orphans. */
    isDone(task: T, ctx: TaskContext): boolean;
}
