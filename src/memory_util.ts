
/**
 * Bump this whenever the Memory schema changes in a way that needs cleanup, and add the
 * cleanup to `migrateMemory`.
 *
 * 2.5: BaseMemory.baseLayout changed from a Map (which serialized to `{}` and was lost) to a
 *      plain object; removed RoomMemory._sourceToHarvestSpotMap; dropped orphaned task memory.
 */
export const CURRENT_MEMORY_VERSION = "2.5";

export class MemoryUtil {
  public static shouldInitializeMemory(): boolean {
    return !Memory.currentMemoryVersion || Memory.currentMemoryVersion !== CURRENT_MEMORY_VERSION;
  }

  public static initializeMemory() {
    console.log("Initializing memory to version " + CURRENT_MEMORY_VERSION);

    // Perform a full reset of memory only if we detect a fresh respawn
    if (Object.keys(Game.spawns).length === 1 && Object.keys(Game.creeps).length === 0) {
      console.log(`Fully resetting memory at ${Game.time}.`);

      for (const memKey of Object.keys(Memory)) {
        delete Memory[memKey as keyof Memory];
      }

      Memory.creeps = {};
      Memory.spawns = {};
      Memory.rooms = {};
      Memory.flags = {};
    }

    migrateMemory(Memory);
  }
}

/**
 * Cleans up memory written by older versions and fills in any missing top-level fields.
 * Safe to call repeatedly; does nothing destructive once memory is at the current version.
 */
export function migrateMemory(memory: Memory): void {
  if (memory.currentMemoryVersion !== CURRENT_MEMORY_VERSION) {
    // Base layouts from older versions were stored as Maps and are empty; drop them so they are
    // recomputed when the base is created.
    delete (memory as Partial<Memory>).bases_v3;

    // Task memory was never loaded back after a global reset, so anything stored is orphaned.
    delete (memory as Partial<Memory>).tasks;

    for (const roomName in memory.rooms ?? {}) {
      delete (memory.rooms[roomName] as unknown as Record<string, unknown>)._sourceToHarvestSpotMap;
    }
  }

  initializeDefaults(memory);
  memory.currentMemoryVersion = CURRENT_MEMORY_VERSION;
}

function initializeDefaults(memory: Memory): void {
  memory.creeps ??= {};
  memory.rooms ??= {};
  memory.bases_v3 ??= {};
  memory.sources ??= {};
  memory.tasks ??= {};
  memory.nextTaskId ??= 0;
  memory.log ??= {
    lastReportedDate: -1,
    infoMessages: [],
    warningMessages: [],
  };
}
