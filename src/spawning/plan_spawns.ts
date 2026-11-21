import { SpawnIntent } from "intents/types";
import { getMyStructures } from "snapshot/queries";
import { RoomSnapshot } from "snapshot/types";
import { SpawnRequest } from "tasks/types";
import { bodyCost, buildBody } from "./body";

/**
 * Assigns the highest-priority spawn requests to idle spawns.
 *
 * Bodies are sized to the room's full energy capacity, or to the energy available now for
 * `urgent` requests. If the top request can't be afforded yet, spawning waits for it instead
 * of spending energy on lower-priority requests. Requests the room can never afford (more than
 * its full capacity) are skipped, so they don't block the queue.
 */
export function planSpawns(home: RoomSnapshot, requests: readonly SpawnRequest[]): SpawnIntent[] {
    const idleSpawns = getMyStructures(home, STRUCTURE_SPAWN).filter(s => !s.spawning);
    const queue = [...requests].sort((a, b) => b.priority - a.priority);
    const intents: SpawnIntent[] = [];
    let energy = home.energyAvailable;

    for (const spawn of idleSpawns) {
        let request = queue.shift();
        while (request && !buildBody(request.body, home.energyCapacityAvailable)) {
            request = queue.shift();
        }
        if (!request) {
            break;
        }
        const budget = request.urgent ? energy : home.energyCapacityAvailable;
        const body = buildBody(request.body, budget);
        if (!body || bodyCost(body) > energy) {
            break;
        }
        energy -= bodyCost(body);
        intents.push({
            kind: 'spawn',
            spawnId: spawn.id as Id<StructureSpawn>,
            body,
            name: `${request.taskName}_${home.tick}_${intents.length}`,
            memory: { ...request.memory, taskName: request.taskName, baseRoomName: home.name },
        });
    }
    return intents;
}
