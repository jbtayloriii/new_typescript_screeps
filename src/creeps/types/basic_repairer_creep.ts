import { BaseCreepActions } from "base/base_creep_actions";
import { ActionBuildStucture } from "../actions/action_build_structure";
import { ActionHarvestSource } from "../actions/action_harvest_source";
import { CreepBlueprint } from "../creep_blueprint";
import { CreepHandler } from "../creep_handler";
import { CreepType } from "../creep_handler_factory";


export class BasicRepairerCreepBlueprint extends CreepBlueprint {
  private roomName: string;

  constructor(room: Room) {
    super(room);
    this.roomName = room.name;
  }

  getBody(): BodyPartConstant[] {
    return [WORK, CARRY, WORK, WORK, MOVE, MOVE];
  }

  getType(): CreepType {
    return CreepType.BASIC_REPAIRER;
  }

  getInitialMemory(): BasicRepairerCreepMemory {
    return {
      currentState: BasicRepairerCreepState.GET_ENERGY,
      roomName: this.roomName,
      creepType: CreepType.BASIC_REPAIRER,
      owningRoomId: this.owningRoomId,
    };
  }
}

export const enum BasicRepairerCreepState {
  GET_ENERGY = 1,
  REPAIR_NEAREST = 2,
}

export class BasicRepairerCreepHandler extends CreepHandler {
  memory: BasicRepairerCreepMemory;
  roomName: string;

  constructor(creep: Creep) {
    super(creep);
    const memory = creep.memory as BasicRepairerCreepMemory;
    this.memory = memory;
    this.roomName = memory.roomName;
  }

  handle(creepActions: BaseCreepActions) {
// todo: implement and allow for more general energy gathering

    // if (this.memory.currentState == BasicBuilderCreepState.HARVEST_SOURCE &&
    //   this.creep.store[RESOURCE_ENERGY] === this.creep.store.getCapacity()) {
    //   this.memory.currentState = BasicBuilderCreepState.BUILD_NEAREST_BUILDING;
    // }

    // if (this.memory.currentState == BasicBuilderCreepState.BUILD_NEAREST_BUILDING
    //   && this.creep.store[RESOURCE_ENERGY] === 0) {
    //   this.memory.currentState = BasicBuilderCreepState.HARVEST_SOURCE;
    // }

    // if (this.memory.currentState == BasicBuilderCreepState.HARVEST_SOURCE) {
    //   ActionHarvestSource.performAction({creep: this.creep});

    // } else if (this.memory.currentState == BasicBuilderCreepState.BUILD_NEAREST_BUILDING) {
    //   ActionBuildStucture.performAction({creep: this.creep});
    // }
  }

}