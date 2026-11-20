import { deliverEnergy, gatherEnergy, runWorker } from "./behaviors";
import { BodyPattern, HarvestTaskMemory, SpawnRequest, TaskDefinition } from "./types";

export const HARVESTERS_PER_SOURCE = 2;
export const HARVESTER_BODY: BodyPattern = { pattern: [WORK, CARRY, MOVE], maxRepeats: 3 };

/** Highest priority in the base: nothing else can spawn without harvested energy. */
export const HARVEST_PRIORITY = 100;

/** Harvests one source and delivers the energy to spawns, extensions, towers and storage. */
export const harvestTask: TaskDefinition<HarvestTaskMemory> = {
    getSpawnRequests(task, ctx) {
        const requests: SpawnRequest[] = [];
        for (let i = ctx.creeps.length; i < HARVESTERS_PER_SOURCE; i++) {
            requests.push({
                taskName: task.name,
                priority: HARVEST_PRIORITY - 10 * i,
                body: HARVESTER_BODY,
                // Without any harvester the base can't refill, so spawn whatever is affordable now.
                urgent: i === 0,
            });
        }
        return requests;
    },

    decide(task, ctx) {
        const gather = gatherEnergy({ fromStores: false, sourceId: task.sourceId });
        return ctx.creeps.flatMap(creep => runWorker(creep, ctx.home, gather, deliverEnergy));
    },

    isDone(task, ctx) {
        return !ctx.home.sources.some(s => s.id === task.sourceId);
    },
};
