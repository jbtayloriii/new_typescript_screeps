import { BasicHarvestTaskState } from "tasks/basic_harvest_task";
import { BasicUpgradeTaskState } from "tasks/basic_upgrade_task";
import { PromiseId } from "./resource_memory";

export const enum TaskKind {
  Unknown = 0,
  BasicHarvestTaskKind = 1,
  BasicUpgradeTaskKind = 2,
}

declare global {

  interface TaskMemory {
    kind: TaskKind;
  }

  interface BasicHarvestTaskMemory extends TaskMemory {
    currentState: BasicHarvestTaskState;
    sourceId: Id<Source>;
    spawnId: Id<StructureSpawn>;
    promiseId: PromiseId | null;
  }

  interface BasicUpgradeTaskMemory extends TaskMemory {
    currentState: BasicUpgradeTaskState;
    sourceId: Id<Source>;
    controllerId: Id<StructureController>;
    promiseId: PromiseId | null;
  }
}