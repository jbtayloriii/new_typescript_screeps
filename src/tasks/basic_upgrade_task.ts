import { TaskKind } from "types/task_memory";
import { ITask } from "tasks/task";
import { CreepRequestHandler } from "resources/creep_request_handler";
import { CreepPromise } from "resources/promises/creep_promise";
import { PromiseManager } from "resources/promise_manager";



const BASIC_UPGRADER_BODY = [WORK, MOVE, CARRY];
const BASIC_UPGRADE_TASK_PRIORITY = 90;

export enum BasicUpgradeTaskState {
  STATE_UNKNOWN = 0,
  STATE_STARTING = 1,
  STATE_REQUESTING_CREEP = 2,
  STATE_CREEP_HARVESTING = 3,
  STATE_CREEP_UPGRADING = 4,
}

export class BasicUpgradeTask implements ITask {
  private memory: BasicUpgradeTaskMemory;
  private source: Source;
  private controller: StructureController;
  private creepPromise: CreepPromise | null;

  static createNewTask(source: Source, controller: StructureController): BasicUpgradeTask {
    const memory = {
      kind: TaskKind.BasicUpgradeTaskKind,
      currentState: BasicUpgradeTaskState.STATE_STARTING,
      sourceId: source.id,
      controllerId: controller.id,
      promiseId: null,
    }
    return new BasicUpgradeTask(memory, source, controller, /* creepPromise= */ null);
  }

  static deserialize(memory: BasicUpgradeTaskMemory, promiseManager: PromiseManager): BasicUpgradeTask {
    const source = Game.getObjectById(memory.sourceId);
    if (!source) {
      throw "Cannot find source for basic upgrade task";
    }

    // todo: handle if spawn is destroyed
    const controller = Game.getObjectById(memory.controllerId);
    if (!controller) {
      throw "Cannot find spawn for basic upgrade task";
    }

    let creepPromise: CreepPromise | null;
    if (memory.promiseId) {
      creepPromise = promiseManager.getCreepPromise(memory.promiseId);
    } else {
      creepPromise = null;
    }
    return new BasicUpgradeTask(memory, source, controller, creepPromise);
  }

  constructor(memory: BasicUpgradeTaskMemory, source: Source, controller: StructureController, creepPromise: CreepPromise | null) {
    this.memory = memory;
    this.source = source;
    this.controller = controller;
    this.creepPromise = creepPromise;
  }

  requestResources(requestHandler: CreepRequestHandler): void {
    if (!this.creepPromise) {
      this.creepPromise = requestHandler.newCreepRequest(BASIC_UPGRADER_BODY, BASIC_UPGRADE_TASK_PRIORITY);
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

    if (this.memory.currentState === BasicUpgradeTaskState.STATE_CREEP_HARVESTING) {
      if (creep.store[RESOURCE_ENERGY] === creep.store.getCapacity()) {
        this.memory.currentState
      }
    }
    // implement
    return false;
  }

  getMemory(): BasicUpgradeTaskMemory {
    return this.memory;
  }
}