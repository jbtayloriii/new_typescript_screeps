import { buildBody } from "spawning/body";
import { gatherEnergy, runWorker, upgradeController } from "./behaviors";
import { upgradeWorkBudget } from "./economy";
import { BodyPattern, SpawnRequest, TaskDefinition, UpgradeTaskMemory } from "./types";

export const MAX_UPGRADERS = 6;
export const UPGRADER_BODY: BodyPattern = { pattern: [WORK, CARRY, MOVE], maxRepeats: 10 };

/** The first upgrader keeps the controller from downgrading, so it comes right after the economy. */
export const FIRST_UPGRADER_PRIORITY = 85;
export const EXTRA_UPGRADER_PRIORITY = 50;

/**
 * Gets energy and upgrades the base's controller. Requests upgraders until their WORK parts
 * reach the base's upgrade budget (see `upgradeWorkBudget`), with each body capped to the WORK
 * still missing so a small budget doesn't get one oversized upgrader.
 */
export const upgradeTask: TaskDefinition<UpgradeTaskMemory> = {
    getSpawnRequests(task, ctx) {
        const budget = upgradeWorkBudget(ctx.economy, ctx.home);
        let work = ctx.creeps.reduce((sum, c) => sum + (c.activeParts[WORK] ?? 0), 0);
        const requests: SpawnRequest[] = [];
        for (let i = ctx.creeps.length; i < MAX_UPGRADERS && work < budget; i++) {
            const body: BodyPattern = { ...UPGRADER_BODY, maxRepeats: Math.min(UPGRADER_BODY.maxRepeats, budget - work) };
            const planned = buildBody(body, ctx.home.energyCapacityAvailable);
            work += planned ? planned.filter(p => p === WORK).length : 1;
            requests.push({
                taskName: task.name,
                priority: i === 0 ? FIRST_UPGRADER_PRIORITY : EXTRA_UPGRADER_PRIORITY - 5 * (i - 1),
                body,
            });
        }
        return requests;
    },

    decide(task, ctx) {
        const gather = gatherEnergy({ fromStores: true, controllerContainerFirst: true });
        return ctx.creeps.flatMap(creep => runWorker(creep, ctx.home, gather, upgradeController));
    },

    isDone(task, ctx) {
        return !ctx.home.controller?.my;
    },
};
