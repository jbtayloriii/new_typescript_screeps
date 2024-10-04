import { MemorySource } from "./memory_source";

export interface BaseMemory {
    sources: SourceMemory[];
}

export const mapBaseMemory = function(room: Room): BaseMemory {
    let sources = room.find(FIND_SOURCES);

    let sourceMemoryList: SourceMemory[] = [];
    for(let source of sources) {
        sourceMemoryList.push(MemorySource.mapSourceMemory(source));
    }

    return {
        sources: sourceMemoryList,
    }
}