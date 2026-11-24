import { encodeRoute } from "tasks/remote_roads";
import { REMOTE_DISTANCE_ESTIMATE } from "tasks/remote_mine_task";
import { basePlanCoordToBuildingObj } from "utils/string_utils";

/** A remote room the survey should measure: its name and source positions (from intel). */
export interface RemoteToSurvey {
    readonly targetRoom: RoomName;
    readonly sources: readonly { readonly id: string; readonly x: number; readonly y: number }[];
}

/** Rooms a path to a remote may cross (the base, the remote, and a room in between). */
const REMOTE_PATH_MAX_ROOMS = 4;

/**
 * One-time measurements of a base that need game APIs (PathFinder, terrain), saved in BaseMemory
 * so pure decisions can use them. Runs for any field still missing, so existing bases fill them
 * in on the next tick:
 * - path lengths from the spawn to each source and each remote source;
 * - a road route to each remote room (built later, in stages: see `tasks/remote_roads.ts`).
 * Remote measurements for rooms that are no longer remotes are dropped.
 */
export function surveyBase(room: Room, baseMemory: BaseMemory, remotes: readonly RemoteToSurvey[] = []): void {
    const [x, y] = baseMemory.initialSpawn.split('_').map(Number);
    const spawnPos = new RoomPosition(x, y, room.name);

    if (!baseMemory.sourceDistances) {
        const distances: { [sourceId: string]: number } = {};
        for (const source of room.find(FIND_SOURCES)) {
            distances[source.id] = PathFinder.search(spawnPos, { pos: source.pos, range: 1 }, { maxRooms: 1 }).path.length;
        }
        baseMemory.sourceDistances = distances;
    }

    surveyRemotes(room, baseMemory, spawnPos, remotes);
}

function surveyRemotes(room: Room, baseMemory: BaseMemory, spawnPos: RoomPosition, remotes: readonly RemoteToSurvey[]): void {
    const distances = baseMemory.remoteDistances ?? {};
    const routes = baseMemory.remoteRoutes ?? {};
    const keepSources = new Set(remotes.flatMap(r => r.sources.map(s => s.id)));
    const keepRooms = new Set(remotes.map(r => r.targetRoom));
    for (const id of Object.keys(distances)) {
        if (!keepSources.has(id)) delete distances[id];
    }
    for (const target of Object.keys(routes)) {
        if (!keepRooms.has(target)) delete routes[target];
    }

    const roomCallback = roadPreferringCosts(room.name, baseMemory);
    for (const remote of remotes) {
        if (remote.sources.length === 0 || (routes[remote.targetRoom] && remote.sources.every(s => distances[s.id] !== undefined))) {
            continue;
        }
        let route: RemoteRoute = [];
        for (const source of remote.sources) {
            const result = PathFinder.search(spawnPos, { pos: new RoomPosition(source.x, source.y, remote.targetRoom), range: 1 }, {
                plainCost: 2,
                swampCost: 10,
                maxRooms: REMOTE_PATH_MAX_ROOMS,
                roomCallback,
            });
            if (result.incomplete) {
                // Keep the estimate rather than searching again every tick.
                distances[source.id] = REMOTE_DISTANCE_ESTIMATE;
                continue;
            }
            distances[source.id] = result.path.length;
            route = encodeRoute(result.path, route);
        }
        // Saved even when empty (no complete path), so the search isn't repeated every tick.
        routes[remote.targetRoom] = route;
    }
    baseMemory.remoteDistances = distances;
    baseMemory.remoteRoutes = routes;
}

/**
 * Cost matrices for planning remote routes: existing roads and the base layout's planned roads
 * are cheap (so routes reuse them), and other buildings block.
 */
function roadPreferringCosts(homeRoom: RoomName, baseMemory: BaseMemory): (roomName: RoomName) => CostMatrix | boolean {
    return (roomName) => {
        const costs = new PathFinder.CostMatrix();
        if (roomName === homeRoom) {
            for (const coordString of Object.values(baseMemory.baseLayout).flat()) {
                const { coord, structure } = basePlanCoordToBuildingObj(coordString);
                // A rampart can be planned over another structure: it never makes that tile cheaper.
                const cost = structure === STRUCTURE_ROAD ? 1
                    : structure === STRUCTURE_CONTAINER || structure === STRUCTURE_RAMPART ? 2 : 0xff;
                costs.set(coord.x, coord.y, Math.max(costs.get(coord.x, coord.y), cost));
            }
        }
        const visible = Game.rooms[roomName];
        if (visible) {
            for (const s of visible.find(FIND_STRUCTURES)) {
                if (s.structureType === STRUCTURE_ROAD) {
                    costs.set(s.pos.x, s.pos.y, 1);
                } else if (s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART) {
                    costs.set(s.pos.x, s.pos.y, 0xff);
                }
            }
        }
        return costs;
    };
}
