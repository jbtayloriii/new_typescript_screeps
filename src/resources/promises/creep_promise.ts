import { ResourcePromise } from "./promise";

export class CreepPromise implements ResourcePromise {
  private promiseId: string;
  private creep: Creep | null;
  private body: BodyPartConstant[];

  constructor(promiseId: string, creep: Creep | null, body: BodyPartConstant[]) {
    this.promiseId = promiseId;
    this.creep = creep;
    this.body = body;
  }

  public getPromiseId():string {
    return this.promiseId;
  }

  public hasCreep(): boolean {
    return this.creep !== null;
  }

  public getCreep(): Creep | null {
    return this.creep;
  }

  public setCreep(creep: Creep): void {
    this.creep = creep;
  }

  public static deserialize(memory: CreepPromiseMemory): CreepPromise {
    const creep = memory.creepId in Game.creeps ? Game.creeps[memory.creepId]: null;
    return new CreepPromise(memory.promiseId, creep, memory.body);
  }
}