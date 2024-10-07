import { BaseMemory } from "./base_memory";
import { BaseMemoryMapper } from "./utils/base_memory_mapper";
import { SourceMemoryMapper } from "./utils/source_memory_mapper";


export class MemoryCache {

    public static getBaseMemory(room: Room): BaseMemory {
        if (!Memory.bases_v2) {
            Memory.bases_v2 = {};
        }

        if (!Memory.bases_v2[room.name]) {
            Memory.bases_v2[room.name] = BaseMemoryMapper.mapBaseMemory(room);
            for (let sourceId of Memory.bases_v2[room.name].sources) {
                let source = Game.getObjectById(sourceId);
                if (source) {
                    let sourceMemory = SourceMemoryMapper.mapSourceMemory(source);
                    Memory.sources[source.id] = sourceMemory;
                }
            }
        }

        return Memory.bases_v2[room.name];
    }
}