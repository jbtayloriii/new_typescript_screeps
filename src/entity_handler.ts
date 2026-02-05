

/** Class that contains functions for updating the current state of game entities.
 * 
 * References to game objects (creeps, structures, etc.) need to be recreated each tick
 * to correctly maintain game state. This class handles initial setup at the beginning of each tick
 * as well as links between objects that may happen as game objects take actions.
 */

import { CreepHandler } from "creeps/creep_handler";
import { CreepHandlerFactory } from "creeps/creep_handler_factory";
import { MemoryCache } from "memory/memory_cache";
import { Task } from "tasks/task";

export interface BaseEntities {
    creeps: Creep[];
    structures: Structure[];
}

export class EntityHandler {
    private creepHandlerMap: Map<RoomName, CreepHandler[]>;

    private taskToRoomMap: Map<RoomName, Task[]>;

    private constructor(creepHandlerMap: Map<RoomName, CreepHandler[]>) {
        this.creepHandlerMap = creepHandlerMap;
    }

    /** Creates a new EntityHandler for the given tick. */
    public static create(creeps: { [creepName: string]: Creep }) {
        let creepHandlerMap = this.createCreepHandlerMap(creeps);
        return new EntityHandler(creepHandlerMap);
    }

    /** Creates a map of room names (baseIds) to creep handlers associated with that room. */
    private static createCreepHandlerMap(creeps: { [creepName: string]: Creep }): Map<RoomName, CreepHandler[]> {
        const creepMap = new Map<RoomName, CreepHandler[]>();

        for (let creepName in creeps) {
            const handler = CreepHandlerFactory.createHandlerFromCreep(
                creeps[creepName]
            );
            const roomId = handler.getRoomName();
            if (!creepMap.has(roomId)) {
                creepMap.set(roomId, []);
            }
            creepMap.get(roomId)!.push(handler);
        }

        return creepMap;
    }

    /** Returns all creep handlers for a specific base. */
    public getCreepHandlersForBase(baseId: RoomName): CreepHandler[] {
        if (this.creepHandlerMap.has(baseId)) {
            let handlers = this.creepHandlerMap.get(baseId);
            if (handlers) {
                return handlers;
            }
        }
        return [];
    }

    public updateGameMemory(): void {
        // Delete memory of creeps that no longer exist
        for (let creepName in Memory.creeps) {
            if (!Game.creeps[creepName]) {
                MemoryCache.unlinkCreep(creepName);

                delete Memory.creeps[creepName];
            }
        }
    }
}
