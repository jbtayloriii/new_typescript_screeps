import { ErrorMapper } from "./third_party/error_mapper";
import { Headquarters } from "./headquarters";
import { MemoryUtil } from "./memory_util";
import { Logger } from "logging/logger";
import { maybeGeneratePixel } from "cpu";
import { removeDeadCreepMemory } from "memory/creep_memory";
import { createWorldSnapshot } from "snapshot/world";

// Make sure to both initialize memory before looping over the HQ, but also to do so in the game loop
console.log(`---Full object reset at ${Game.time}---`);
MemoryUtil.initializeMemory();

const globalHq = Headquarters.initialize();

export const loop = ErrorMapper.wrapLoop(() => {
  if (MemoryUtil.shouldInitializeMemory()) {
    MemoryUtil.initializeMemory();
  }

  if (maybeGeneratePixel(Game.cpu)) {
    Logger.info("Generated pixel");
  }

  removeDeadCreepMemory(Memory, new Set(Object.keys(Game.creeps)));

  globalHq.setUpBases();
  globalHq.run(createWorldSnapshot());

  // Logger.report();
});
