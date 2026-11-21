import { Intent } from "intents/types";
import { MyCreepSnapshot, RoomSnapshot } from "snapshot/types";
import { WorldSnapshot } from "snapshot/world";
import { IntelMap } from "intel/types";
import { DirectiveMap } from "directives/types";

/**
 * A task is a single goal (harvest a source, upgrade the controller, ...) that owns some
 * creeps. It is made of:
 * - Saved state: a `TaskMemory` entry in `Memory.tasks[baseRoomName]`.
 * - Behavior: a stateless `TaskDefinition` for its type (see `tasks/registry.ts`).
 *
 * Tasks never store their creeps; each tick the base hands every task the creeps whose
 * `memory.taskName` matches.
 */

export type TaskType = 'mine' | 'haul' | 'upgrade' | 'build' | 'repair' | 'scout' | 'remoteMine' | 'claim';

interface TaskMemoryBase {
    /** Unique name, e.g. "W1N1_harvest_3". Creeps refer to their task by this name. */
    readonly name: string;
    /** The base that owns this task. */
    readonly roomName: RoomName;
}

/**
 * One of the base's own sources: harvesters while the base is small, then a static miner (see
 * `tasks/mine_task.ts`). Replaced the separate 'harvest' task type; old ones are dropped as unknown.
 */
export interface MineTaskMemory extends TaskMemoryBase {
    readonly type: 'mine';
    readonly sourceId: Id<Source>;
    /** Where the miner (or parked harvester) stands and the source's container goes. In the source's room. */
    readonly containerTile?: { readonly x: number; readonly y: number };
}

/** Carries energy from mine containers and dropped energy to where the base needs it. */
export interface HaulTaskMemory extends TaskMemoryBase {
    readonly type: 'haul';
}

/**
 * Without `targetRoom`: the base's routine scout, keeping adjacent rooms' intel fresh.
 * With `targetRoom` (from a scout directive): sees that one room, however far away.
 */
export interface ScoutTaskMemory extends TaskMemoryBase {
    readonly type: 'scout';
    readonly targetRoom?: RoomName;
    readonly directiveId?: string;
}

/** Mines a nearby room's sources and hauls the energy home. Runs a remoteMine directive. */
export interface RemoteMineTaskMemory extends TaskMemoryBase {
    readonly type: 'remoteMine';
    readonly targetRoom: RoomName;
    /** Optional only for tasks saved before directives existed (migration 3 links them). */
    readonly directiveId?: string;
}

/** Claims a room and builds its first spawn. Runs a claim directive. */
export interface ClaimTaskMemory extends TaskMemoryBase {
    readonly type: 'claim';
    readonly targetRoom: RoomName;
    readonly directiveId: string;
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

export type TaskMemory =
    | MineTaskMemory
    | HaulTaskMemory
    | UpgradeTaskMemory
    | BuildTaskMemory
    | RepairTaskMemory
    | ScoutTaskMemory
    | RemoteMineTaskMemory
    | ClaimTaskMemory;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** What's needed to create a task; the name and room are filled in when it is saved. */
export type TaskSpec = DistributiveOmit<TaskMemory, 'name' | 'roomName'>;

/**
 * A body: `base` parts once, then `pattern` repeated up to `maxRepeats` times as energy allows.
 * E.g. [WORK, CARRY, MOVE] repeated up to 3 times, or a miner's fixed 5×WORK + MOVE base with
 * extra MOVE parts when affordable.
 */
export interface BodyPattern {
    readonly base?: readonly BodyPartConstant[];
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
    /** Extra initial memory for the creep (e.g. its role or assigned source). */
    readonly memory?: Partial<CreepMemory>;
}

/** Base-wide economy numbers, computed once per tick (see `tasks/economy.ts`). */
export interface EconomySummary {
    /** 'static' once a miner (no CARRY) works one of the base's sources; 'harvest' before that. */
    readonly mode: 'harvest' | 'static';
    /** Estimated energy brought in per tick. */
    readonly incomePerTick: number;
    /** Energy per tick spent replacing the base's non-upgrader creeps. */
    readonly upkeepPerTick: number;
}

export interface TaskContext {
    readonly world: WorldSnapshot;
    /** The task's base room. */
    readonly home: RoomSnapshot;
    /** This task's creeps (including ones still spawning), wherever they are. */
    readonly creeps: readonly MyCreepSnapshot[];
    readonly baseMemory: Readonly<BaseMemory>;
    /** All of the base's tasks, including this one. */
    readonly baseTasks: readonly TaskMemory[];
    readonly economy: EconomySummary;
    readonly intel: IntelMap;
    /** All directives, so directive-driven tasks can read theirs (e.g. a claim's spawn position). */
    readonly directives: DirectiveMap;
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
