import { SourceMemoryMapper } from "./utils/source_memory_mapper";

export interface BaseMemory {
    sources: SourceMemory[];
}

export const mapBaseMemory = function(room: Room): BaseMemory {
    let sources = room.find(FIND_SOURCES);

    let sourceMemoryList: SourceMemory[] = [];
    for(let source of sources) {
        sourceMemoryList.push(SourceMemoryMapper.mapSourceMemory(source));
    }

    return {
        sources: sourceMemoryList,
    }
}