import { buildNearest, gatherEnergy, runWorker } from "./behaviors";
import { desiredBuilderCount } from "./economy";
import { BodyPattern, BuildTaskMemory, SpawnRequest, TaskDefinition } from "./types";

export const BUILDER_BODY: BodyPattern = { pattern: [WORK, CARRY, MOVE], maxRepeats: 5 };
export const BUILD_PRIORITY = 80;

/**
 * Builds the base's construction sites, with builders scaled to the remaining work (see
 * `desiredBuilderCount`). Done (and removed) once there are none left.
 */
export const buildTask: TaskDefinition<BuildTaskMemory> = {
    getSpawnRequests(task, ctx) {
        const requests: SpawnRequest[] = [];
        for (let i = ctx.creeps.length; i < desiredBuilderCount(ctx.home); i++) {
            requests.push({ taskName: task.name, priority: BUILD_PRIORITY - 5 * i, body: BUILDER_BODY });
        }
        return requests;
    },

    decide(task, ctx) {
        const gather = gatherEnergy({ fromStores: true });
        return ctx.creeps.flatMap(creep => runWorker(creep, ctx.home, gather, buildNearest));
    },

    isDone(task, ctx) {
        return ctx.home.constructionSites.length === 0;
    },
};
