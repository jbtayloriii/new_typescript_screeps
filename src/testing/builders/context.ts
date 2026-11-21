import { IntelMap } from "intel/types";
import { DirectiveMap } from "directives/types";
import { MyCreepSnapshot, RoomSnapshot } from "snapshot/types";
import { WorldSnapshot } from "snapshot/world";
import { EconomySummary, TaskContext, TaskMemory } from "tasks/types";
import { worldOf } from "./world";

/** A base memory with an empty layout, planned recently so construction stays quiet. */
export function aBaseMemory(overrides: Partial<BaseMemory> = {}): BaseMemory {
    return { currentControllerLevelPlan: 8, lastBaseLayoutPlanTick: 1, initialSpawn: '10_10', baseLayout: {}, ...overrides };
}

export interface TaskContextOptions {
    readonly world?: WorldSnapshot;
    /** Defaults to every creep present in the home room. */
    readonly creeps?: readonly MyCreepSnapshot[];
    readonly baseMemory?: BaseMemory;
    readonly baseTasks?: readonly TaskMemory[];
    readonly economy?: Partial<EconomySummary>;
    readonly intel?: IntelMap;
    readonly directives?: DirectiveMap;
}

/** A TaskContext for `home` with defaults for everything else. */
export function aTaskContext(home: RoomSnapshot, opts: TaskContextOptions = {}): TaskContext {
    return {
        world: opts.world ?? worldOf([home]),
        home,
        creeps: opts.creeps ?? home.creepsPresent,
        baseMemory: opts.baseMemory ?? aBaseMemory(),
        baseTasks: opts.baseTasks ?? [],
        economy: { mode: 'harvest', incomePerTick: 0, upkeepPerTick: 0, ...opts.economy },
        intel: opts.intel ?? {},
        directives: opts.directives ?? {},
    };
}
