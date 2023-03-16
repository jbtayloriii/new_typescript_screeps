import { BasicHarvesterCreepHandler } from "./types/basic_harvester_creep";
import { BasicUpgraderCreepHandler } from "./types/basic_upgrader_creep";
import { CreepHandler } from "./creep_handler";
import { BasicBuilderCreepHandler } from "./types/basic_builder_creep";

export enum CreepType {
  BASIC_HARVESTER = 0,
  BASIC_UPGRADER = 1,
  BASIC_BUILDER = 2,
}

export class CreepHandlerFactory {


  static createHandlerFromCreep(creep: Creep): CreepHandler {
    const mem: CreepMemory = creep.memory;
    switch (mem.creepType) {
      case CreepType.BASIC_HARVESTER:
        return new BasicHarvesterCreepHandler(creep);
      case CreepType.BASIC_UPGRADER:
        return new BasicUpgraderCreepHandler(creep);
      case CreepType.BASIC_BUILDER:
        return new BasicBuilderCreepHandler(creep);
      // TODO: fill out
    }

    throw 'unimplemented';
  }
}