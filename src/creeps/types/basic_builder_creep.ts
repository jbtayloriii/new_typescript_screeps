import { BaseCreepActions } from "base/base_creep_actions";
import { buildStructure } from "../actions/build_structure";
import { CreepBlueprint } from "../creep_blueprint";
import { CreepHandler } from "../creep_handler";
import { CreepType } from "../creep_handler_factory";
import { getEnergy } from "creeps/actions/get_energy";


export class BasicBuilderCreepBlueprint extends CreepBlueprint {
  constructor(room: Room) {
    super(room);
  }

  getBody(): BodyPartConstant[] {
    return [WORK, MOVE, CARRY];
  }

  getType(): CreepType {
    return CreepType.BASIC_BUILDER;
  }

  getInitialMemory(): BasicBuilderCreepMemory {
    return {
      currentState: BasicBuilderCreepState.HARVEST_SOURCE,
      creepType: CreepType.BASIC_BUILDER,
      owningRoomId: this.owningRoomId,
      links: {},
    };
  }
}

export const enum BasicBuilderCreepState {
  HARVEST_SOURCE = 1,
  BUILD_NEAREST_BUILDING = 2,
}

export class BasicBuilderCreepHandler extends CreepHandler {
  memory: BasicBuilderCreepMemory;

  constructor(creep: Creep) {
    super(creep);
    const memory = creep.memory as BasicBuilderCreepMemory;
    this.memory = memory;
  }

  handle(creepActions: BaseCreepActions): void {
    if (this.memory.currentState == BasicBuilderCreepState.HARVEST_SOURCE &&
      this.creep.store[RESOURCE_ENERGY] === this.creep.store.getCapacity()) {
      this.memory.currentState = BasicBuilderCreepState.BUILD_NEAREST_BUILDING;
    }

    if (this.memory.currentState == BasicBuilderCreepState.BUILD_NEAREST_BUILDING
      && this.creep.store[RESOURCE_ENERGY] === 0) {
      this.memory.currentState = BasicBuilderCreepState.HARVEST_SOURCE;
    }

    if (this.memory.currentState == BasicBuilderCreepState.HARVEST_SOURCE) {
      getEnergy(this.creep, creepActions);

    } else if (this.memory.currentState == BasicBuilderCreepState.BUILD_NEAREST_BUILDING) {
      buildStructure(this.creep);
    }
  }

}