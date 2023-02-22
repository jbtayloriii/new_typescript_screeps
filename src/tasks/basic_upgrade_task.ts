import { TaskKind } from "types/task_memory";
import { ITask } from "tasks/task";
import { CreepRequestHandler } from "resources/creep_request_handler";

export const enum BasicUpgradeTaskState {
  STATE_UNKNOWN = 0,
  STATE_STARTING = 1,
}

export class BasicUpgradeTask implements ITask {
  private memory: BasicUpgradeTaskMemory;

  static createNewTask(source: Source, controller: StructureController): BasicUpgradeTask {
    const memory = {
      kind: TaskKind.BasicUpgradeTaskKind,
      currentState: BasicUpgradeTaskState.STATE_STARTING,
      sourceId: source.id,
      controllerId: controller.id,
      promiseId: null,
    }
    return new BasicUpgradeTask(memory, source, controller);
  }

  constructor(memory: BasicUpgradeTaskMemory, source: Source, controller: StructureController) {
    this.memory = memory;
  }

  requestResources(requestHandler: CreepRequestHandler): void {

  }

  execute(): boolean {
    // implement
    return false;
  }

  getMemory(): BasicUpgradeTaskMemory {
    return this.memory;
  }

  static deserialize(memory: BasicHarvestTaskMemory): BasicUpgradeTask {
    // TODO
    return new BasicUpgradeTask();
  }
}