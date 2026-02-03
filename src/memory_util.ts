
const CURRENT_MEMORY_VERSION = "2.4";

export class MemoryUtil {
  public static shouldInitializeMemory(): boolean {
    // Check if we should do a full reset of memory. Do this only if we detect a single spawn without any creeps


    if (!Memory.currentMemoryVersion || Memory.currentMemoryVersion !== CURRENT_MEMORY_VERSION) {
      return true;
    }
    return false;
  }

  public static initializeMemory() {
    console.log("Initializing memory to version " + CURRENT_MEMORY_VERSION);

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

    // RawMemory.set("{}");
    MemoryUtil.initializeOtherMemory();

    if (!Memory.roomInfo) {
      Memory.roomInfo = {};
    }

    Memory.currentMemoryVersion = CURRENT_MEMORY_VERSION;
  }

  private static initializeOtherMemory(): void {
    // Add other memory initializers here
    if (!Memory.log) {
      Memory.log = {
        lastReportedDate: -1,
        infoMessages: [],
        warningMessages: [],
      };
    }
  }
}
