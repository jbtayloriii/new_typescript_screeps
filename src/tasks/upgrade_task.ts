import { gatherEnergy, runWorker, upgradeController } from "./behaviors";
import { BodyPattern, SpawnRequest, TaskDefinition, UpgradeTaskMemory } from "./types";

export const MAX_UPGRADERS = 3;
export const UPGRADER_BODY: BodyPattern = { pattern: [WORK, CARRY, MOVE], maxRepeats: 4 };

/** The first upgrader keeps the controller from downgrading, so it comes right after harvesters. */
export const FIRST_UPGRADER_PRIORITY = 85;
export const EXTRA_UPGRADER_PRIORITY = 50;

/** Gets energy and upgrades the base's controller. Never finishes while the controller is mine. */
export const upgradeTask: TaskDefinition<UpgradeTaskMemory> = {
    getSpawnRequests(task, ctx) {
        const requests: SpawnRequest[] = [];
        for (let i = ctx.creeps.length; i < MAX_UPGRADERS; i++) {
            requests.push({
                taskName: task.name,
                priority: i === 0 ? FIRST_UPGRADER_PRIORITY : EXTRA_UPGRADER_PRIORITY - 5 * (i - 1),
                body: UPGRADER_BODY,
            });
        }
        return requests;
    },

    decide(task, ctx) {
        const gather = gatherEnergy({ fromStores: true });
        return ctx.creeps.flatMap(creep => runWorker(creep, ctx.home, gather, upgradeController));
    },

    isDone(task, ctx) {
        return !ctx.home.controller?.my;
    },
};
