export const enum TaskKind {
  Unknown = 0,
  BasicHarvestTask = 1,
  BasicUpgradeTask = 2,
}

declare global {

  interface TaskMemory {
    kind: TaskKind;
  }

  interface BasicHarvestTaskMemory extends TaskMemory {
    kind: TaskKind.BasicHarvestTask;
  }

  interface BasicUpgradeTaskMemory extends TaskMemory {
    kind: TaskKind.BasicUpgradeTask;
  }
}