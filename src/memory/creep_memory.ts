/** Deletes memory of creeps that no longer exist. Returns the names removed. */
export function removeDeadCreepMemory(memory: Memory, liveCreepNames: ReadonlySet<string>): string[] {
    const removed: string[] = [];
    for (const name in memory.creeps) {
        if (!liveCreepNames.has(name)) {
            delete memory.creeps[name];
            removed.push(name);
        }
    }
    return removed;
}
