
const CURRENT_MEMORY_VERSION = "2.3";

export class MemoryUtil {
  public static shouldInitializeMemory(): boolean {
    if (!Memory.currentMemoryVersion || Memory.currentMemoryVersion !== CURRENT_MEMORY_VERSION) {
      return true;
    }
    return false;
  }

  public static initializeMemory() {
		console.log("Initializing memory to version " + CURRENT_MEMORY_VERSION);

		// RawMemory.set("{}");
		MemoryUtil.initializeOtherMemory();

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