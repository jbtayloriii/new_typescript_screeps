import { CreepBlueprint } from "./api/creep_blueprint";


export class BasicHarvesterCreepBlueprint implements CreepBlueprint {
  getBody(): BodyPartConstant[] {
    return [WORK, MOVE, CARRY];
  }

  getInitialMemory(): CreepMemory {
    return {
      // todo
    };
  }
}

export class BasicHarvesterCreep {
  memory: CreepMemory;
  dropOffLocation: Structure;
  source: Source;
  creep: Creep;

  execute(): boolean {
    if (this.memory.currentState == BasicHarvesterCreepState.HARVESTING &&
      this.creep.store[RESOURCE_ENERGY] === this.creep.store.getCapacity()) {
      this.memory.currentState = BasicHarvesterCreepState.DROPPING_OFF;
    }

    if (this.memory.currentState == BasicHarvesterCreepState.DROPPING_OFF
      && this.creep.store[RESOURCE_ENERGY] === 0) {
      this.memory.currentState = BasicHarvesterCreepState.HARVESTING;
    }

    return false;
  }
}