import { MyCreepSnapshot, RoomSnapshot } from "snapshot/types";
import { EconomySummary, TaskMemory } from "./types";

/**
 * Rough, pure estimates of a base's energy flow, used to size upgraders and builders. These are
 * deliberately simple; tune them once phase 6 stats show real numbers.
 */

/** Energy a source regenerates per tick: 3000 per 300 ticks, or 1500 if unreserved and unowned. */
export const OWNED_SOURCE_ENERGY_PER_TICK = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME;
export const REMOTE_SOURCE_ENERGY_PER_TICK = SOURCE_ENERGY_NEUTRAL_CAPACITY / ENERGY_REGEN_TIME;

/** Fraction of its life a harvester spends harvesting rather than walking to deliver. */
export const HARVESTER_DUTY_CYCLE = 0.5;

/** Spawn energy per tick to keep one upgrader WORK part alive ([WORK, CARRY, MOVE] per WORK). */
const UPGRADER_UPKEEP_PER_WORK = (BODYPART_COST[WORK] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE]) / CREEP_LIFE_TIME;

/** Storage energy kept in reserve before extra energy goes to upgrading. */
export const STORAGE_UPGRADE_RESERVE = 50000;
/** Each this much storage energy above the reserve adds one upgrader WORK part. */
export const STORAGE_ENERGY_PER_EXTRA_WORK = 25000;

/** Remaining construction progress one builder handles. */
export const BUILD_PROGRESS_PER_BUILDER = 5000;
export const MAX_BUILDERS = 3;

function work(creeps: readonly MyCreepSnapshot[]): number {
    return creeps.filter(c => !c.spawning).reduce((sum, c) => sum + (c.activeParts[WORK] ?? 0), 0);
}

function partsCost(creep: MyCreepSnapshot): number {
    return Object.entries(creep.activeParts)
        .reduce((sum, [part, count]) => sum + BODYPART_COST[part as BodyPartConstant] * (count ?? 0), 0);
}

export function computeEconomy(
    tasks: readonly TaskMemory[],
    creepsByTask: ReadonlyMap<string, readonly MyCreepSnapshot[]>): EconomySummary {
    let income = 0;
    let upkeep = 0;
    for (const task of tasks) {
        const creeps = creepsByTask.get(task.name) ?? [];
        switch (task.type) {
            case 'mine': {
                // Miners harvest all the time; harvesters (with CARRY) spend about half their time walking.
                const miners = creeps.filter(c => (c.activeParts[CARRY] ?? 0) === 0);
                const harvesters = creeps.filter(c => (c.activeParts[CARRY] ?? 0) > 0);
                income += Math.min(OWNED_SOURCE_ENERGY_PER_TICK,
                    HARVEST_POWER * (work(miners) + work(harvesters) * HARVESTER_DUTY_CYCLE));
                break;
            }
            case 'remoteMine':
                // Miners with more than 3 WORK only exist while the room is reserved (10/tick).
                for (const miner of creeps.filter(c => c.memory.role === 'miner')) {
                    const minerWork = work([miner]);
                    const cap = minerWork > 3 ? OWNED_SOURCE_ENERGY_PER_TICK : REMOTE_SOURCE_ENERGY_PER_TICK;
                    income += Math.min(cap, HARVEST_POWER * minerWork);
                }
                break;
        }
        if (task.type !== 'upgrade') {
            upkeep += creeps.reduce((sum, c) => sum + partsCost(c), 0) / CREEP_LIFE_TIME;
        }
    }
    return {
        mode: tasks.some(t => t.type === 'mine'
            && (creepsByTask.get(t.name) ?? []).some(c => (c.activeParts[CARRY] ?? 0) === 0)) ? 'static' : 'harvest',
        incomePerTick: income,
        upkeepPerTick: upkeep,
    };
}

/**
 * How many upgrader WORK parts the base can afford: spare income (halved while there's
 * construction, which also needs energy), plus a bonus from storage above the reserve. Always at
 * least 1 so the controller never downgrades, and at most 15 at RCL 8 (the game's upgrade cap).
 */
export function upgradeWorkBudget(economy: EconomySummary, home: RoomSnapshot): number {
    let spare = economy.incomePerTick - economy.upkeepPerTick;
    if (home.constructionSites.length > 0) {
        spare /= 2;
    }
    let budget = Math.floor(spare / (UPGRADE_CONTROLLER_POWER + UPGRADER_UPKEEP_PER_WORK));

    const storage = home.structures.find(s => s.structureType === STRUCTURE_STORAGE && s.owner === 'me');
    const stored = storage?.store?.energy ?? 0;
    if (stored > STORAGE_UPGRADE_RESERVE) {
        budget += Math.floor((stored - STORAGE_UPGRADE_RESERVE) / STORAGE_ENERGY_PER_EXTRA_WORK);
    }

    const max = home.controller?.level === 8 ? CONTROLLER_MAX_UPGRADE_PER_TICK : Infinity;
    return Math.max(1, Math.min(max, budget));
}

/** Builders needed for the remaining construction work: none without sites, else 1 to MAX_BUILDERS. */
export function desiredBuilderCount(home: RoomSnapshot): number {
    const remaining = home.constructionSites.reduce((sum, s) => sum + s.progressTotal - s.progress, 0);
    if (home.constructionSites.length === 0) {
        return 0;
    }
    return Math.max(1, Math.min(MAX_BUILDERS, Math.ceil(remaining / BUILD_PROGRESS_PER_BUILDER)));
}
