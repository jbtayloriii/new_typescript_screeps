import { ITask } from "./task";
import { CreepPromise } from "resources/promises/creep_promise";
import { TaskKind } from "types/task_memory";
import { CreepRequestHandler } from "resources/creep_request_handler";
import { PromiseManager } from "resources/promise_manager";

const BASIC_HARVESTER_BODY = [WORK, MOVE, CARRY];
const BASIC_HARVEST_TASK_PRIORITY = 100;

export enum BasicHarvestTaskState {
  STATE_UNKNOWN = 0,
  STATE_STARTING = 1,
  STATE_REQUESTING_CREEP = 2,
  STATE_CREEP_HARVESTING = 3,
  STATE_CREEP_DEPOSITING = 4,
}

export class BasicHarvestTask implements ITask {
  private memory: BasicHarvestTaskMemory;
  private source: Source;
  private spawn: StructureSpawn;
  private creepPromise: CreepPromise | null;

  static createNewTask(source: Source, spawn: StructureSpawn): BasicHarvestTask {
    const memory = {
      kind: TaskKind.BasicHarvestTaskKind,
      currentState: BasicHarvestTaskState.STATE_STARTING,
      sourceId: source.id,
      spawnId: spawn.id,
      promiseId: null,
    };
    return new BasicHarvestTask(memory, source, spawn, /* creepPromise= */ null);
  }

  static deserialize(memory: BasicHarvestTaskMemory, promiseManager: PromiseManager): BasicHarvestTask {
    const source = Game.getObjectById(memory.sourceId);
    if (!source) {
      throw "Cannot find source for basic harvest task";
    }

    // todo: handle if spawn is destroyed
    const spawn = Game.getObjectById(memory.spawnId);
    if (!spawn) {
      throw "Cannot find spawn for basic harvest task";
    }

    let creepPromise: CreepPromise | null;
    if (memory.promiseId) {
      creepPromise = promiseManager.getCreepPromise(memory.promiseId);
    } else {
      creepPromise = null;
    }
    return new BasicHarvestTask(memory, source, spawn, creepPromise);
  }

  constructor(memory: BasicHarvestTaskMemory, source: Source, spawn: StructureSpawn, creepPromise: CreepPromise | null) {
    this.memory = memory;
    this.source = source;
    this.spawn = spawn;
    this.creepPromise = creepPromise;
  }

  requestResources(requestHandler: CreepRequestHandler, promiseManager: PromiseManager): void {
    if (!this.creepPromise) {
      const newPromise = promiseManager.createCreepPromise(BASIC_HARVESTER_BODY);
      this.creepPromise = requestHandler.newCreepRequest(BASIC_HARVESTER_BODY, BASIC_HARVEST_TASK_PRIORITY);
      this.memory.promiseId = this.creepPromise.getPromiseId();
    }
  }

  execute(): boolean {
    if (!this.creepPromise) {
      return false;
    }

    const creep = this.creepPromise.getCreep();
    if (!creep) {
      return false;
    }

    if (this.memory.currentState === BasicHarvestTaskState.STATE_CREEP_HARVESTING)

    if (this.memory.currentState === BasicHarvestTaskState.STATE_CREEP_HARVESTING) {
      // Full harvest
      if (creep.store[RESOURCE_ENERGY] === creep.store.getCapacity()) {
        this.memory.currentState = BasicHarvestTaskState.STATE_CREEP_DEPOSITING;
        return true;
      }

      const harvestCode = creep.harvest(this.source);

      // TODO: Implement a cached path here
      if (harvestCode === ERR_NOT_IN_RANGE) {
        creep.moveTo(this.source);
      }
    } else if (this.memory.currentState === BasicHarvestTaskState.STATE_CREEP_DEPOSITING) {
      if (creep.store[RESOURCE_ENERGY] === 0) {
        this.memory.currentState = BasicHarvestTaskState.STATE_CREEP_HARVESTING;
        return true;
      }

      const transferCode = creep.transfer(this.spawn, RESOURCE_ENERGY);
      // TODO: Implement a cached path here
      if (transferCode === ERR_NOT_IN_RANGE) {
        creep.moveTo(this.source);
      }
    } else {
      this.memory.currentState = BasicHarvestTaskState.STATE_CREEP_HARVESTING;
      return true;
    }
    return false;
  }

  public getMemory(): BasicHarvestTaskMemory {
    return this.memory;
  }
}