import { gatherEnergy, repairNearest, runWorker } from "./behaviors";
import { BodyPattern, RepairTaskMemory, TaskDefinition } from "./types";

export const REPAIRER_BODY: BodyPattern = { pattern: [WORK, CARRY, MOVE], maxRepeats: 2 };
export const REPAIR_PRIORITY = 60;

/** Keeps one creep repairing damaged structures (upgrading when nothing needs repair). */
export const repairTask: TaskDefinition<RepairTaskMemory> = {
    getSpawnRequests(task, ctx) {
        return ctx.creeps.length > 0 ? [] : [{ taskName: task.name, priority: REPAIR_PRIORITY, body: REPAIRER_BODY }];
    },

    decide(task, ctx) {
        const gather = gatherEnergy({ fromStores: true });
        return ctx.creeps.flatMap(creep => runWorker(creep, ctx.home, gather, repairNearest));
    },

    isDone() {
        return false;
    },
};
