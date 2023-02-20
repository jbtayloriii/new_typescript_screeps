import { IBase } from "base/base";
import { StarterBase } from "base/starter_base";
import { BaseKind } from "global_types";

export class Headquarters {
  private bases: IBase[];
  private baseMemory: BaseMemory[];

  constructor(baseMemory: BaseMemory[], bases: IBase[]) {
    this.baseMemory = baseMemory;
    this.bases = bases;
  }

  public checkWorld(): void {
    // TODO: wrap in a check so that this doesn't run every tick
    if (this.bases.length == 0) {
      this.bases.push(StarterBase.createStarterBase(this.baseMemory));
    }
  }

  public processResourceRequests(): void {
    this.bases.forEach(base => base.processResourceRequests());
  }

  public run(): void {
    this.bases.forEach(base => base.run());
  }

  public serialize(): void {
    console.log("serializing hq");
    console.log(Memory.bases);
    console.log(Memory.bases.length);
  }

  public static deserialize(baseMemories: BaseMemory[]): Headquarters {
    const bases: Array<IBase> = [];
    for (let baseMem of baseMemories) {
      bases.push(Headquarters.deserializeBase(baseMem));
    }
    return new Headquarters(baseMemories, bases);
  }

  private static deserializeBase(memory:BaseMemory): IBase {
    if (memory.kind == BaseKind.StarterBase) {
      return StarterBase.deserialize(memory as StarterBaseMemory);
    }
    throw "Attempted to deserialize unexpected BaseMemory";
  }
}