import { BaseMemory } from "memory/base_memory";

export class BaseMemoryMapper {

    /** Creates a memory object for the given Base/Room.
     * 
     * Currently maps:
     *  - Sources (IDs)
     */
    public static mapBaseMemory(room: Room): BaseMemory {
        let sources = room.find(FIND_SOURCES);
    
        let sourceMemoryList: Id<Source>[] = [];
        for(let source of sources) {
            sourceMemoryList.push(source.id);
        }
    
        return {
            sources: sourceMemoryList,
        }
    }
}