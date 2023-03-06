import { PromiseKind } from "types/resource_memory";
import { ResourcePromise } from "./promise";

export const enum CreepPromiseState {
  UNKNOWN = 0,
  REQUESTING = 1,
  CREEP_ALIVE = 2,
  CREEP_DELETED = 3,
}

export class CreepPromise implements ResourcePromise {
  private memory: CreepPromiseMemory;
  private creep: Creep | null;

  constructor(memory: CreepPromiseMemory) {
    this.memory = memory;
    this.creep = memory.creepId in Game.creeps ? Game.creeps[memory.creepId]: null;
  }

  public static newCreepPromise(promiseId: string, body: Array<BodyPartConstant>) {
    const memory = {
      kind: 1,
      body: body,
      creepId: promiseId + '_test',
      creepState: CreepPromiseState.REQUESTING,
      promiseId: promiseId,
    }
    return new CreepPromise(memory);
  }

  public getPromiseId():string {
    return this.memory.promiseId;
  }

  public hasCreep(): boolean {
    return this.creep !== null;
  }

  public getCreep(): Creep | null {
    return this.creep;
  }

  public getBody(): Array<BodyPartConstant> {
    return this.memory.body;
  }

  public setState(newState: CreepPromiseState): void {
    this.memory.creepState = newState;
  }

  public setCreep(creep: Creep): void {
    this.creep = creep;
  }

  public static deserialize(memory: CreepPromiseMemory): CreepPromise {
    return new CreepPromise(memory);
  }
}