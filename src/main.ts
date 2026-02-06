import { ErrorMapper } from "./third_party/error_mapper";
import { Headquarters } from "./headquarters";
import { MemoryUtil } from "./memory_util";
import { handleFlagCommand } from "./commands/flag_commands";
import { Logger } from "logging/logger";

import "./prototypes/creep_prototype";
import "./prototypes/room_position_prototype";
import "./prototypes/room_prototype";
import "./prototypes/tower_prototype";
import { EntityHandler } from "entity_handler";
import { TaskHandler } from "tasks/task_handler";


// Make sure to both initialize memory before looping over the HQ, but also to do so in the game loop
console.log(`---Full object reset at ${Game.time}---`);
MemoryUtil.initializeMemory();

var globalHq = Headquarters.initialize();

const taskHandler = new TaskHandler();

export const loop = ErrorMapper.wrapLoop(() => {
  if (MemoryUtil.shouldInitializeMemory()) {
    MemoryUtil.initializeMemory();
  }

  if (Game.cpu.bucket >= 10000) {
    Game.cpu.generatePixel();
    Logger.info("Generating pixel");
  }

  Object.entries(Game.flags).forEach(
    ([key, value]) => handleFlagCommand(value)
  );

  // Create handlers, update memory 
  let entityHandler = EntityHandler.create(Game.creeps);
  EntityHandler.updateGameMemory();
  taskHandler.updateCreepToTasks(Game.creeps);

  // Create bases if necessary
  globalHq.setUpBases();

  // Handle base actions
  globalHq.plan(entityHandler);
  globalHq.processResourceRequests(entityHandler);
  globalHq.run(entityHandler);
  globalHq.cleanUp(entityHandler);

  Logger.report();

  // TODO: move into headquarters and bases
  for (let roomName in Game.rooms) {
    let towers = Game.rooms[roomName].find(FIND_MY_STRUCTURES, {
      filter: { structureType: STRUCTURE_TOWER }
    }) as StructureTower[];
    for (let i = 0; i < towers.length; i++) {
      const tower = towers[i];
      if (!tower.attackEnemy()) {
        tower.repairStructures();
      }
    }
  }
});
