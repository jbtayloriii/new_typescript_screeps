import { BaseCreepActions } from "base/base_creep_actions";
import { CreepBlueprint } from "../creep_blueprint";
import { CreepHandler } from "../creep_handler";
import { CreepType } from "../creep_handler_factory";
import { returnEnergyToStructure } from "creeps/actions/action_return_resource_to_structure";
import { harvestNearestSource } from "creeps/actions/action_harvest_nearest_source";


export class BasicHarvesterCreepBlueprint extends CreepBlueprint {
  private sourceId: Id<Source>;
  private spawnId: Id<StructureSpawn>;

  constructor(room: Room, source: Source, spawn: StructureSpawn) {
    super(room);
    this.sourceId = source.id;
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
      sourceId: this.sourceId,
      dropOffLocationId: this.spawnId,
      creepType: CreepType.BASIC_HARVESTER,
      owningRoomId: this.owningRoomId,
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
  source: Source;
  
  constructor(creep: Creep) {
    super(creep);
    const harvesterMemory = creep.memory as BasicHarvesterCreepMemory;
    this.memory = harvesterMemory;

    const source = Game.getObjectById(harvesterMemory.sourceId);
    if (!source) {
      throw `Unable to create basic harvester creep: Invalid source with ID ${harvesterMemory.sourceId}`;
    }
    this.source = source;

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
      harvestNearestSource(this.creep, creepActions);

    } else if (this.memory.currentState == BasicHarvesterCreepState.DROPPING_OFF) {
      returnEnergyToStructure(this.creep);
    }
  }
}