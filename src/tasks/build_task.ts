import { buildNearest, gatherEnergy, runWorker } from "./behaviors";
import { BodyPattern, BuildTaskMemory, TaskDefinition } from "./types";

export const BUILDER_BODY: BodyPattern = { pattern: [WORK, CARRY, MOVE], maxRepeats: 3 };
export const BUILD_PRIORITY = 80;

/** Builds the base's construction sites. Done (and removed) once there are none left. */
export const buildTask: TaskDefinition<BuildTaskMemory> = {
    getSpawnRequests(task, ctx) {
        return ctx.creeps.length > 0 ? [] : [{ taskName: task.name, priority: BUILD_PRIORITY, body: BUILDER_BODY }];
    },

    decide(task, ctx) {
        const gather = gatherEnergy({ fromStores: true });
        return ctx.creeps.flatMap(creep => runWorker(creep, ctx.home, gather, buildNearest));
    },

    isDone(task, ctx) {
        return ctx.home.constructionSites.length === 0;
    },
};
