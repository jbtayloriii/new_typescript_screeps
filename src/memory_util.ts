import { CURRENT_MEMORY_VERSION, migrateMemory, needsMigration } from "memory/migrations";

export class MemoryUtil {
  public static shouldInitializeMemory(): boolean {
    return needsMigration(Memory);
  }

  public static initializeMemory() {
    // Perform a full reset of memory only if we detect a fresh respawn
    if (isFreshRespawn(Object.keys(Game.spawns).length, Object.keys(Game.creeps).length)) {
      console.log(`Fully resetting memory at ${Game.time}.`);

      for (const memKey of Object.keys(Memory)) {
        delete Memory[memKey as keyof Memory];
      }

      Memory.creeps = {};
      Memory.spawns = {};
      Memory.rooms = {};
      Memory.flags = {};
    }

    const applied = migrateMemory(Memory);
    if (applied.length > 0) {
      console.log(`Migrated memory to version ${CURRENT_MEMORY_VERSION} (applied ${applied.join(", ")})`);
    }
  }
}

/** A fresh respawn has exactly one spawn and no creeps, so any existing memory is stale. */
export function isFreshRespawn(spawnCount: number, creepCount: number): boolean {
  return spawnCount === 1 && creepCount === 0;
}
