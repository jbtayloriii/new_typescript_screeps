import { BaseMemory } from "memory/base_memory";
import { SourceMemoryMapper } from "./source_memory_mapper";


export class BaseMemoryMapper {

    /** Creates a memory object for the given Base/Room.
     * 
     * Currently maps:
     *  - Sources
     */
    public static mapBaseMemory(room: Room): BaseMemory {
        let sources = room.find(FIND_SOURCES);
    
        let sourceMemoryList: SourceMemory[] = [];
        for(let source of sources) {
            sourceMemoryList.push(SourceMemoryMapper.mapSourceMemory(source));
        }
    
        return {
            sources: sourceMemoryList,
        }
    }
}