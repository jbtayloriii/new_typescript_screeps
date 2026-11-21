import { SpawnIntent } from "intents/types";
import { getMyStructures } from "snapshot/queries";
import { RoomSnapshot } from "snapshot/types";
import { SpawnRequest } from "tasks/types";
import { bodyCost, buildBody, minimalBody } from "./body";

/** What happened to a spawn request this tick (shown by the spawn queue panel). */
export type SpawnQueueStatus =
    /** Spawning now. */
    | 'spawning'
    /** The request every spawn is waiting on, until there's enough energy. */
    | 'waiting'
    /** Behind the request being spawned or waited on. */
    | 'queued'
    /** Needs more than the room's full energy capacity, so it's skipped. */
    | 'unaffordable';

export interface SpawnQueueEntry {
    readonly request: SpawnRequest;
    readonly status: SpawnQueueStatus;
    /** The body it would get now (or its minimal body if it can't be built). */
    readonly body: readonly BodyPartConstant[];
    readonly cost: number;
    /** For 'waiting': the energy left when it was considered (after earlier spawns this tick). */
    readonly energyLeft?: number;
}

export interface SpawnPlan {
    readonly intents: SpawnIntent[];
    /** Every request in priority order, with its status. */
    readonly queue: SpawnQueueEntry[];
}

/** Assigns the highest-priority spawn requests to idle spawns. See `planSpawnQueue`. */
export function planSpawns(home: RoomSnapshot, requests: readonly SpawnRequest[]): SpawnIntent[] {
    return planSpawnQueue(home, requests).intents;
}

/**
 * Assigns the highest-priority spawn requests to idle spawns, and reports what happened to each.
 *
 * Bodies are sized to the room's full energy capacity, or to the energy available now for
 * `urgent` requests. If the top request can't be afforded yet, spawning waits for it instead
 * of spending energy on lower-priority requests. Requests the room can never afford (more than
 * its full capacity) are skipped, so they don't block the queue.
 */
export function planSpawnQueue(home: RoomSnapshot, requests: readonly SpawnRequest[]): SpawnPlan {
    const idleSpawns = getMyStructures(home, STRUCTURE_SPAWN).filter(s => !s.spawning);
    const sorted = [...requests].sort((a, b) => b.priority - a.priority);
    const intents: SpawnIntent[] = [];
    const queue: SpawnQueueEntry[] = [];
    let energy = home.energyAvailable;
    let spawnsLeft = idleSpawns.length;
    let blocked = false;

    for (const request of sorted) {
        if (!buildBody(request.body, home.energyCapacityAvailable)) {
            const body = minimalBody(request.body);
            queue.push({ request, status: 'unaffordable', body, cost: bodyCost(body) });
            continue;
        }
        const budget = request.urgent ? energy : home.energyCapacityAvailable;
        const body = buildBody(request.body, budget) ?? minimalBody(request.body);
        const cost = bodyCost(body);
        if (blocked || spawnsLeft === 0) {
            queue.push({ request, status: 'queued', body, cost });
            continue;
        }
        if (cost > energy || !buildBody(request.body, budget)) {
            queue.push({ request, status: 'waiting', body, cost, energyLeft: energy });
            blocked = true;
            continue;
        }
        const spawn = idleSpawns[idleSpawns.length - spawnsLeft];
        spawnsLeft--;
        energy -= cost;
        intents.push({
            kind: 'spawn',
            spawnId: spawn.id as Id<StructureSpawn>,
            body: [...body],
            name: `${request.taskName}_${home.tick}_${intents.length}`,
            memory: { ...request.memory, taskName: request.taskName, baseRoomName: home.name },
        });
        queue.push({ request, status: 'spawning', body, cost });
    }
    return { intents, queue };
}
