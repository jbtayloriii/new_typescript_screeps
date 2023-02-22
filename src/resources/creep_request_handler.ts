import { CreepPromise } from "./promises/creep_promise";
import { PromiseManager } from "./promise_manager";

export const enum CreepRequestPriorities {

}

export class CreepRequestHandler {
  private spawns: StructureSpawn[];
  private promises: CreepPromise[];
  private memory: CreepRequestHandlerMemory;
  private promiseManager: PromiseManager;

  constructor(spawns: StructureSpawn[], promises: CreepPromise[], memory: CreepRequestHandlerMemory, promiseManager: PromiseManager) {
    this.spawns = spawns;
    this.promises = promises;
    this.memory = memory;
    this.promiseManager = promiseManager;
  }

  public static fromSpawn(spawn: StructureSpawn, promiseManager: PromiseManager): CreepRequestHandler {
    const memory = {
      spawnIds: [spawn.id],
      promiseIds: [],
    }
    return new CreepRequestHandler([spawn], /* promises= */ [], memory, promiseManager);
  }

  public newCreepRequest(body: BodyPartConstant[], priority: number): CreepPromise {

    const creepPromise = this.promiseManager.createCreepPromise(body);
    this.memory.promiseIds.push(creepPromise.getPromiseId());
    this.promises.push(creepPromise);
    return creepPromise;
  }

  public getMemory(): CreepRequestHandlerMemory {
    return this.memory;
  }

  public static deserialize(mem: CreepRequestHandlerMemory, promiseManager: PromiseManager) {
    const spawns = mem.spawnIds.map(spawnId => Game.getObjectById(spawnId)).filter(spawn => spawn !== null) as StructureSpawn[];
    const promises = mem.promiseIds.map(promiseId => promiseManager.getCreepPromise(promiseId)).filter(promise => promise !== null) as CreepPromise[];
    
    // TODO: error handle if the spawns don't exist anymore
    return new CreepRequestHandler(spawns, promises, mem, promiseManager);
  }
}