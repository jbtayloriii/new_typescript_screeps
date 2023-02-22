import { PromiseId, PromiseKind } from "types/resource_memory";
import { CreepPromise } from "./promises/creep_promise";

interface PromiseMap {
  creepPromises: Map<string, CreepPromise>;
}

export class PromiseManager {
  private creepPromiseMap: Map<string, CreepPromise>;

  constructor(creepPromiseMap: Map<string, CreepPromise>) {
    this.creepPromiseMap = creepPromiseMap;
  }

  public static deserialize(promisesMemory: PromiseMemory[]): PromiseManager {
    let creepPromiseMap: Map<string, CreepPromise> = new Map();

    for (let memory of promisesMemory) {
      if (memory.kind === PromiseKind.CREEP_PROMISE) {
        creepPromiseMap.set(memory.promiseId, CreepPromise.deserialize(memory as CreepPromiseMemory));
      } else {
        throw "Cannot deserialize unknown promise";
      }
    }

    return new PromiseManager(creepPromiseMap);
  }

  public getCreepPromise(promiseId: PromiseId): CreepPromise | null {
    const prom = this.creepPromiseMap.get(promiseId);
    if (!prom) {
      console.log("Attempted to get nonexistent promise with ID " + promiseId);
      return null;
    }
    return prom;
  }

  public createCreepPromise(body: Array<BodyPartConstant>): CreepPromise {
    const promiseId = "-${Game.time}_${this.creepPromiseMap.size}";

    const promise = new CreepPromise(promiseId, /* creep= */ null, body);
    this.creepPromiseMap.set(promiseId, promise);

    return promise;
  }
}