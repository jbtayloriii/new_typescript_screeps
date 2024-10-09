import { BaseCreepActions } from "base/base_creep_actions";
import { CreepBlueprint } from "../creep_blueprint";
import { CreepHandler } from "../creep_handler";
import { CreepType } from "../creep_handler_factory";
import { returnResourceToStructure } from "creeps/actions/return_resource_to_structure";
import { getEnergy } from "creeps/actions/get_energy";


export class BasicHarvesterCreepBlueprint extends CreepBlueprint {
  private spawnId: Id<StructureSpawn>;

  constructor(room: Room, spawn: StructureSpawn) {
    super(room);
    this.spawnId = spawn.id;
  }

  getType(): CreepType {
    return CreepType.BASIC_HARVESTER;
  }
  getBody(): BodyPartConstant[] {
    return [WORK, MOVE, CARRY];
  }

  getInitialMemory(): BasicHarvesterCreepMemory {
    return {
      currentState: BasicHarvesterCreepState.HARVESTING,
      dropOffLocationId: this.spawnId,
      creepType: CreepType.BASIC_HARVESTER,
      owningRoomId: this.owningRoomId,
      links: {},
    }
  }
}

export const enum BasicHarvesterCreepState {
  HARVESTING = 0,
  DROPPING_OFF = 1,
}

export class BasicHarvesterCreepHandler extends CreepHandler {
  memory: BasicHarvesterCreepMemory;
  dropOffLocation: StructureSpawn;
  
  constructor(creep: Creep) {
    super(creep);
    const harvesterMemory = creep.memory as BasicHarvesterCreepMemory;
    this.memory = harvesterMemory;

    const dropOffLocation = Game.getObjectById(harvesterMemory.dropOffLocationId);
    if (!dropOffLocation) {
      throw `Unable to create basic harvester creep; no drop off location ${harvesterMemory.dropOffLocationId}`;
    }
    this.dropOffLocation = dropOffLocation;
  }

  handle(creepActions: BaseCreepActions): void {
    // state changes
    if (this.memory.currentState == BasicHarvesterCreepState.HARVESTING &&
      this.creep.store[RESOURCE_ENERGY] === this.creep.store.getCapacity()) {
      this.memory.currentState = BasicHarvesterCreepState.DROPPING_OFF;
    }

    if (this.memory.currentState == BasicHarvesterCreepState.DROPPING_OFF
      && this.creep.store[RESOURCE_ENERGY] === 0) {
      this.memory.currentState = BasicHarvesterCreepState.HARVESTING;
    }

    if (this.memory.currentState == BasicHarvesterCreepState.HARVESTING) {
      getEnergy(this.creep, creepActions);

    } else if (this.memory.currentState == BasicHarvesterCreepState.DROPPING_OFF) {
      returnResourceToStructure(this.creep);
    }
  }
}