import { MyCreepSnapshot, RoomSnapshot } from "snapshot/types";
import { SpawnPlan, SpawnQueueStatus } from "spawning/plan_spawns";
import { upgradeWorkBudget } from "tasks/economy";
import { isMiner } from "tasks/mine_task";
import { isRemoteThreatened } from "tasks/remote_mine_task";
import { staleNeighbors } from "tasks/scout_task";
import { EconomySummary, SpawnRequest, TaskContext, TaskMemory, TaskType } from "tasks/types";

/**
 * A plain-data summary of one base's tick, for the HUD (see `visuals/`). Built from what the base
 * tick already computed, and only when visuals are on for the room.
 */
export interface BaseReport {
    readonly roomName: RoomName;
    readonly tick: number;
    readonly rcl: number;
    /** Progress to the next RCL, 0–1, or null at RCL 8 / without a controller. */
    readonly rclProgress: number | null;
    readonly energyAvailable: number;
    readonly energyCapacity: number;
    readonly economy: EconomySummary;
    readonly upgradeBudget: number;
    readonly tasks: readonly TaskReport[];
    readonly spawnQueue: readonly SpawnQueueReport[];
    readonly spawns: { readonly total: number; readonly busy: number };
}

export interface CreepReport {
    readonly name: string;
    readonly role?: CreepMemory['role'];
    /** The creep's gather/work state, if its task uses one. */
    readonly state?: number;
    readonly ticksToLive?: number;
    readonly spawning: boolean;
    /** True for creeps without CARRY (miners). */
    readonly miner: boolean;
}

export interface TaskReport {
    readonly name: string;
    readonly type: TaskType;
    /** For directive tasks: the target room and directive id, e.g. "W1N2 (d3)". */
    readonly label?: string;
    readonly creeps: readonly CreepReport[];
    /** Creeps it has plus creeps it's asking for. */
    readonly wanted: number;
    /** A short type-specific note, e.g. "4 sites" or "WORK 3/6". */
    readonly detail?: string;
}

export interface SpawnQueueReport {
    readonly taskName: string;
    readonly taskType?: TaskType;
    readonly priority: number;
    readonly body: readonly BodyPartConstant[];
    readonly cost: number;
    readonly status: SpawnQueueStatus;
    readonly urgent: boolean;
    /** For 'waiting': the energy it had to work with. */
    readonly energyLeft?: number;
}

export interface BaseReportInput {
    readonly home: RoomSnapshot;
    readonly tasks: readonly TaskMemory[];
    readonly byTask: ReadonlyMap<string, readonly MyCreepSnapshot[]>;
    readonly economy: EconomySummary;
    readonly requests: readonly SpawnRequest[];
    readonly spawnPlan: SpawnPlan;
    readonly contextFor: (task: TaskMemory) => TaskContext;
}

export function buildBaseReport(input: BaseReportInput): BaseReport {
    const { home } = input;
    const controller = home.controller;
    const upgradeBudget = upgradeWorkBudget(input.economy, home);
    const spawns = home.structures.filter(s => s.structureType === STRUCTURE_SPAWN && s.owner === 'me');
    const taskTypes = new Map(input.tasks.map(t => [t.name, t.type]));

    return {
        roomName: home.name,
        tick: home.tick,
        rcl: controller?.level ?? 0,
        rclProgress: controller && controller.level < 8 && controller.progressTotal > 0
            ? controller.progress / controller.progressTotal
            : null,
        energyAvailable: home.energyAvailable,
        energyCapacity: home.energyCapacityAvailable,
        economy: input.economy,
        upgradeBudget,
        tasks: input.tasks.map(task => {
            const creeps = input.byTask.get(task.name) ?? [];
            return {
                name: task.name,
                type: task.type,
                label: 'directiveId' in task && task.directiveId && 'targetRoom' in task
                    ? `${task.targetRoom} (${task.directiveId})`
                    : undefined,
                creeps: creeps.map(c => ({
                    name: c.name,
                    role: c.memory.role,
                    state: c.memory.state,
                    ticksToLive: c.ticksToLive,
                    spawning: c.spawning,
                    miner: isMiner(c),
                })),
                wanted: creeps.length + input.requests.filter(r => r.taskName === task.name).length,
                detail: taskDetail(task, creeps, input, upgradeBudget),
            };
        }),
        spawnQueue: input.spawnPlan.queue.map(entry => ({
            taskName: entry.request.taskName,
            taskType: taskTypes.get(entry.request.taskName),
            priority: entry.request.priority,
            body: entry.body,
            cost: entry.cost,
            status: entry.status,
            urgent: entry.request.urgent ?? false,
            energyLeft: entry.energyLeft,
        })),
        spawns: { total: spawns.length, busy: spawns.filter(s => s.spawning).length },
    };
}

function taskDetail(
    task: TaskMemory,
    creeps: readonly MyCreepSnapshot[],
    input: BaseReportInput,
    upgradeBudget: number): string | undefined {
    const home = input.home;
    switch (task.type) {
        case 'mine': {
            const source = home.sources.find(s => s.id === task.sourceId);
            const tile = task.containerTile;
            const container = tile && home.structures.some(s =>
                s.structureType === STRUCTURE_CONTAINER && s.pos.x === tile.x && s.pos.y === tile.y);
            const tiles = source ? `${source.openSpots} tile${source.openSpots === 1 ? '' : 's'}` : 'no source';
            return `${tiles}, ${container ? 'container' : 'no container'}`;
        }
        case 'upgrade': {
            const work = creeps.reduce((sum, c) => sum + (c.activeParts[WORK] ?? 0), 0);
            return `WORK ${work}/${upgradeBudget}`;
        }
        case 'build':
            return `${home.constructionSites.length} site${home.constructionSites.length === 1 ? '' : 's'}`;
        case 'scout': {
            if (task.targetRoom) {
                return undefined;
            }
            const stale = staleNeighbors(input.contextFor(task)).length;
            return stale === 0 ? 'neighbors fresh' : `${stale} to scout`;
        }
        case 'remoteMine':
            return isRemoteThreatened(task, input.contextFor(task)) ? 'paused: hostiles' : undefined;
        default:
            return undefined;
    }
}
