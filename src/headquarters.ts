import { IBase } from "base/base";
import { StarterBase } from "base/starter_base";
import { BaseKind } from "global_types";
import { PromiseManager } from "resources/promise_manager";

export class Headquarters {
  private bases: IBase[];
  private baseMemory: BaseMemory[];
  private promiseManager: PromiseManager;

  private constructor(baseMemory: BaseMemory[], bases: IBase[], promiseManager: PromiseManager) {
    this.baseMemory = baseMemory;
    this.bases = bases;
    this.promiseManager = promiseManager;
  }

  public checkWorld(): void {
    // TODO: wrap in a check so that this doesn't run every tick (?)
    if (this.bases.length == 0) {
      const starterBase = StarterBase.createStarterBase(this.promiseManager);
      this.baseMemory.push(starterBase.getMemory());
      this.bases.push(starterBase);
    }
  }

  public processResourceRequests(): void {
    this.bases.forEach(base => base.processResourceRequests());
  }

  public run(): void {
    this.bases.forEach(base => base.run());
  }

  public cleanUp(): void {
    this.bases.forEach(base => base.cleanUp());
  }

  public static deserialize(baseMemories: BaseMemory[], promisesMemory: PromiseMemory[]): Headquarters {
    const bases: Array<IBase> = [];
    const promiseManager = PromiseManager.deserialize(promisesMemory);
    for (let baseMem of baseMemories) {
      bases.push(Headquarters.deserializeBase(baseMem, promiseManager));
    }

    return new Headquarters(baseMemories, bases, promiseManager);
  }

  private static deserializeBase(memory: BaseMemory, promiseManager: PromiseManager): IBase {
    if (memory.kind == BaseKind.StarterBase) {
      return StarterBase.deserialize(memory as StarterBaseMemory, promiseManager);
    }
    throw "Attempted to deserialize unexpected BaseMemory";
  }
}