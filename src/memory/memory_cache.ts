import { BaseMemory, mapBaseMemory } from "./memory_base";


export class MemoryCache {

    public static getBaseMemory(room: Room): BaseMemory {
        if (!Memory.bases) {
            Memory.bases = {};
        }

        if (!Memory.bases[room.name]) {
            Memory.bases[room.name] = mapBaseMemory(room);
        }

        return Memory.bases[room.name];
    }
}