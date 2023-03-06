import { PromiseId, PromiseKind } from "types/resource_memory";
import { CreepPromise, CreepPromiseState } from "./promises/creep_promise";

interface PromiseMap {
  creepPromises: Map<string, CreepPromise>;
}

export class PromiseManager {
  private creepPromiseMap: Map<string, CreepPromise>;

  private constructor(creepPromiseMap: Map<string, CreepPromise>) {
    this.creepPromiseMap = creepPromiseMap;
  }

  // Handler for previous game state
  public handleGameState(): void {
    for (const name in Memory.creeps) {
      if (!(name in Game.creeps)) {
        const promiseId = Memory.creeps[name].promiseId;
        if (promiseId in this.creepPromiseMap) {
          const creepPromise = this.creepPromiseMap.get(promiseId);
          if (creepPromise) {
            creepPromise.setState(CreepPromiseState.CREEP_DELETED);
          }
        }
        
        delete Memory.creeps[name];
      }
    }
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

    const promise = CreepPromise.newCreepPromise(promiseId, body);
    this.creepPromiseMap.set(promiseId, promise);

    return promise;
  }
}