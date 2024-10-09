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
                    // Map source memory if not already done
                    // No need for return value
                    this.getSourceMemory(source);
                }
            }
        }
        return Memory.bases_v2[room.name];
    }

    public static getSourceMemory(source: Source): SourceMemory {
        if (!Memory.sources[source.id]) {
            let sourceMemory = SourceMemoryMapper.mapSourceMemory(source);
            Memory.sources[source.id] = sourceMemory;
        }
        return Memory.sources[source.id];
    }

    public static unlinkCreep(creepName: string): void {
        if (!Memory.creeps[creepName] || !Memory.creeps[creepName].links) {
            return;
        }
        let links: CreepLinks = Memory.creeps[creepName].links;

        // Unlink power harvest source
        if (links.powerHarvestSourceId) {
            if (Memory.sources[links.powerHarvestSourceId]) {
                if (Memory.sources[links.powerHarvestSourceId].currentPowerHarvester == creepName) {
                    delete Memory.sources[links.powerHarvestSourceId].currentPowerHarvester;
                }
            }
            delete links.powerHarvestSourceId;
        }
    }
}