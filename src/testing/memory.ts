import { migrateMemory } from "memory/migrations";

/**
 * Returns a fresh, fully initialized Memory object for tests. Pass it to code that takes a
 * Memory parameter, or install it as the global with `installTestMemory`.
 */
export function createTestMemory(): Memory {
    const memory = {} as Memory;
    migrateMemory(memory);
    return memory;
}

/** Replaces the global `Memory` with a fresh test memory and returns it. */
export function installTestMemory(): Memory {
    const memory = createTestMemory();
    (global as unknown as { Memory: Memory }).Memory = memory;
    return memory;
}
