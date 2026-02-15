import { SourceMemoryMapper } from "./utils/source_memory_mapper";


export class MemoryCache {

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
