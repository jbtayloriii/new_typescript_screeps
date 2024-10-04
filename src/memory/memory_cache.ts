import { BaseMemory } from "./base_memory";
import { BaseMemoryMapper } from "./utils/base_memory_mapper";


export class MemoryCache {

    public static getBaseMemory(room: Room): BaseMemory {
        if (!Memory.bases) {
            Memory.bases = {};
        }

        if (!Memory.bases[room.name]) {
            Memory.bases[room.name] = BaseMemoryMapper.mapBaseMemory(room);
        }

        return Memory.bases[room.name];
    }
}