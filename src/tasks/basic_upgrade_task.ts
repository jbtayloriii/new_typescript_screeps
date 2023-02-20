import { TaskKind } from "types/task_memory";
import { ITask } from "tasks/task";

export class BasicUpgradeTask implements ITask {

  static createNewTask(source: Source, controller: StructureController): BasicUpgradeTask {
    return new BasicUpgradeTask(source, controller);
  }

  constructor(source: Source, controller: StructureController) {
    
  }

  execute(): boolean {
    // implement
    return false;
  }

  serialize(): BasicUpgradeTaskMemory {
    return {
      kind: TaskKind.BasicUpgradeTask,
    }
  }
}