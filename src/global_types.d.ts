import { Headquarters } from "./headquarters";
import { VisualWindow } from "./visuals/visual_window";

interface IGlobal {
  hq?: Headquarters;
  visualWindow: VisualWindow;
}

export const enum BaseKind {
  Unknown = 0,
  StarterBase = 1,
}

declare global {
  interface Memory {
    currentMemoryVersion: string;
    bases: Array<BaseMemory>;
    promises: Array<PromiseMemory>;
  }

  interface BaseMemory {
    kind: BaseKind;
  }

  interface StarterBaseMemory extends BaseMemory {
    kind: BaseKind.StarterBase;
    tasksMemory: Array<TaskMemory>;
    creepRequestHandlerMemory: CreepRequestHandlerMemory;
  }

}