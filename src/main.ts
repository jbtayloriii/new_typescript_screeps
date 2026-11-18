import { ErrorMapper } from "./third_party/error_mapper";
import { Headquarters } from "./headquarters";
import { MemoryUtil } from "./memory_util";
import { Logger } from "logging/logger";

import "./prototypes/creep_prototype";
import "./prototypes/room_position_prototype";
import { EntityHandler } from "entity_handler";
import { TaskHandler } from "tasks/task_handler";
import { maybeGeneratePixel } from "cpu";


// Make sure to both initialize memory before looping over the HQ, but also to do so in the game loop
console.log(`---Full object reset at ${Game.time}---`);
MemoryUtil.initializeMemory();

var globalHq = Headquarters.initialize();

const taskHandler = new TaskHandler();

export const loop = ErrorMapper.wrapLoop(() => {
  if (MemoryUtil.shouldInitializeMemory()) {
    MemoryUtil.initializeMemory();
  }

  if (maybeGeneratePixel(Game.cpu)) {
    Logger.info("Generated pixel");
  }

  // Create handlers, update memory 
  let entityHandler = EntityHandler.create(Game.creeps);
  EntityHandler.updateGameMemory();
  taskHandler.updateCreepToTasks(Game.creeps);

  // Create bases if necessary
  globalHq.setUpBases(taskHandler);

  // Handle base actions
  globalHq.plan(entityHandler);
  globalHq.processResourceRequests(entityHandler);
  globalHq.run(entityHandler);
  globalHq.cleanUp(entityHandler);

  // Logger.report();
});
