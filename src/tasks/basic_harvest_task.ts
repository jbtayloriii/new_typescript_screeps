import { ITask } from "./task";
import { CreepWrapper } from "creeps/creep_wrapper";
import { TaskKind } from "types/task_memory";

export enum BasicHarvestTaskState {
  STATE_UNKNOWN = 0,
  STATE_STARTING = 1,
  STATE_REQUESTING_CREEP = 2,
  STATE_CREEP_HARVESTING = 3,
  STATE_CREEP_DEPOSITING = 4,
}

export class BasicHarvestTask implements ITask {
  currentState: BasicHarvestTaskState;
  creep: Creep | null;
  source: Source;
  spawn: StructureSpawn;

  static createNewTask(source: Source, spawn: StructureSpawn): BasicHarvestTask {
    return new BasicHarvestTask(BasicHarvestTaskState.STATE_STARTING, source, spawn, null);
  }

  constructor(currentState: BasicHarvestTaskState, source: Source, spawn: StructureSpawn, creepName: string | null) {
    this.currentState = currentState;
    this.source = source;
    this.spawn = spawn;
    if (creepName) {
      this.creep = Game.creeps[creepName];
    } else {
      this.creep = null;
    }
  }

  execute(): boolean {
    if (!this.creep) {
      return false;
    }

    if (this.currentState === BasicHarvestTaskState.STATE_CREEP_HARVESTING) {
      // Full harvest
      if (this.creep.store[RESOURCE_ENERGY] === this.creep.store.getCapacity()) {
        this.currentState = BasicHarvestTaskState.STATE_CREEP_DEPOSITING;
        return true;
      }

      const harvestCode = this.creep.harvest(this.source);

      // TODO: Implement a cached path here
      if (harvestCode === ERR_NOT_IN_RANGE) {
        this.creep.moveTo(this.source);
      }
    } else if (this.currentState === BasicHarvestTaskState.STATE_CREEP_DEPOSITING) {
      if (this.creep.store[RESOURCE_ENERGY] === 0) {
        this.currentState = BasicHarvestTaskState.STATE_CREEP_HARVESTING;
        return true;
      }

      const transferCode = this.creep.transfer(this.spawn, RESOURCE_ENERGY);
      // TODO: Implement a cached path here
      if (transferCode === ERR_NOT_IN_RANGE) {
        this.creep.moveTo(this.source);
      }
    } else {
      this.currentState = BasicHarvestTaskState.STATE_CREEP_HARVESTING;
      return true;
    }
    return false;
  }

  serialize(): BasicHarvestTaskMemory {
    return {
      kind: TaskKind.BasicHarvestTask,
    }
  }
}