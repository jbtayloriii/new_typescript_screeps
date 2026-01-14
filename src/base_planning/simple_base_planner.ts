import { CoordinateString } from "global_types";
import { getBaseLayoutForRoom } from "pathfinding/base_layout_utils";
import { getDiamondMapping, getSquareMapping } from "pathfinding/map_plot_utils";


export type BasePlanBuilding = STRUCTURE_SPAWN
    | STRUCTURE_ROAD
    | STRUCTURE_CONTAINER
    | STRUCTURE_EXTENSION
    | STRUCTURE_TOWER
    | STRUCTURE_STORAGE

/** A simple base planner that works up to level 4.
 * 
 * The planner uses the diamond and square mapper functions to then
 * greedily stamp out prefabs.
  */
export class BasePlanner {

    public static getOrCreateRoomInfoMemory(room: Room, initialSpawnLocation: CoordinateString): RoomInfoMemory {
        if (!Memory.roomInfo) {
            Memory.roomInfo = {};
        }

        // TODO: don't force having an initial spawn location, be able to generate one

        // Create new room info
        if (!Memory.roomInfo[room.name]) {
            Memory.roomInfo[room.name] = this.createRoomInfoMemory(room, initialSpawnLocation);
        }

        return Memory.roomInfo[room.name];
    }

    private static createRoomInfoMemory(room: Room, initialSpawnLocation: CoordinateString): RoomInfoMemory {
        // TODO: see if there's a less expensive way to do this.
        console.log(`Creating new room info memory for ${room.name}`);
        let walls: { x: number, y: number }[] = [];

        let terrain = room.getTerrain();
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                if (terrain.get(x, y) == TERRAIN_MASK_WALL) {
                    walls.push({ x: x, y: y });
                }
            }
        }
        let diamondDistances = getDiamondMapping(walls, 50);
        let squareDistances = getSquareMapping(walls, 50);

        let baseLayout = getBaseLayoutForRoom(room, diamondDistances, squareDistances, 50);

        return {
            initialSpawn: initialSpawnLocation,
            baseLayout: baseLayout,
            diamondDistances: diamondDistances,
            squareDistances: squareDistances,
        }
    }
}
