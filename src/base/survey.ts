import { Coordinate } from "global_types";
import { basePlanCoordToBuildingObj } from "utils/string_utils";

/**
 * One-time measurements of a base that need game APIs (PathFinder, terrain), saved in BaseMemory
 * so pure decisions can use them. Runs for any field still missing, so existing bases fill them
 * in on the next tick.
 */
export function surveyBase(room: Room, baseMemory: BaseMemory): void {
    const [x, y] = baseMemory.initialSpawn.split('_').map(Number);
    const spawnPos = new RoomPosition(x, y, room.name);

    if (!baseMemory.sourceDistances) {
        const distances: { [sourceId: string]: number } = {};
        for (const source of room.find(FIND_SOURCES)) {
            distances[source.id] = PathFinder.search(spawnPos, { pos: source.pos, range: 1 }, { maxRooms: 1 }).path.length;
        }
        baseMemory.sourceDistances = distances;
    }

    if (!baseMemory.controllerContainer && room.controller) {
        const terrain = room.getTerrain();
        const planned = new Set(Object.values(baseMemory.baseLayout).flat()
            .map(basePlanCoordToBuildingObj)
            .map(({ coord }) => `${coord.x}_${coord.y}`));
        baseMemory.controllerContainer = chooseControllerContainerTile(
            room.controller.pos, { x, y }, (tx, ty) => terrain.get(tx, ty) === TERRAIN_MASK_WALL, planned);
    }
}

/**
 * Picks the controller container's tile: 2 tiles from the controller (so upgraders at range 1–3
 * can reach both), not a wall, not on a planned layout tile and not on the room edge. Closest to
 * the spawn by range, ties broken by Manhattan distance (the most direct tile), then scan order.
 */
export function chooseControllerContainerTile(
    controller: Coordinate,
    spawn: Coordinate,
    isWall: (x: number, y: number) => boolean,
    plannedTiles: ReadonlySet<string>): Coordinate | undefined {
    let best: Coordinate | undefined;
    let bestScore: [number, number] = [Infinity, Infinity];
    for (let y = controller.y - 2; y <= controller.y + 2; y++) {
        for (let x = controller.x - 2; x <= controller.x + 2; x++) {
            if (Math.max(Math.abs(x - controller.x), Math.abs(y - controller.y)) !== 2) continue;
            if (x < 1 || y < 1 || x > 48 || y > 48) continue;
            if (isWall(x, y) || plannedTiles.has(`${x}_${y}`)) continue;
            const dx = Math.abs(x - spawn.x);
            const dy = Math.abs(y - spawn.y);
            const score: [number, number] = [Math.max(dx, dy), dx + dy];
            if (score[0] < bestScore[0] || (score[0] === bestScore[0] && score[1] < bestScore[1])) {
                best = { x, y };
                bestScore = score;
            }
        }
    }
    return best;
}
