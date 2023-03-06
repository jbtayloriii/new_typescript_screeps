import { CreepPromise, CreepPromiseState } from "../promises/creep_promise";
import { PromiseManager } from "../promise_manager";

export const enum CreepRequestPriorities {

}

export class CreepRequestHandlerImpl implements CreepRequestHandler{
  private spawns: StructureSpawn[];
  private promises: CreepPromise[];
  private memory: CreepRequestHandlerMemory;
  private promiseManager: PromiseManager;

  private constructor(spawns: StructureSpawn[], promises: CreepPromise[], memory: CreepRequestHandlerMemory, promiseManager: PromiseManager) {
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
    return new CreepRequestHandlerImpl([spawn], /* promises= */ [], memory, promiseManager);
  }

  public handlePromise(newPromise: CreepPromise, priority: number): boolean {
    if (newPromise.getPromiseId() in this.memory.promiseIds) {
      return false;
    }
    if (newPromise.hasCreep()) {
      return false;
    }
    newPromise.setState(CreepPromiseState.REQUESTING);
    this.memory.promiseIds.set(newPromise.getPromiseId(), null);
    this.promises.push(newPromise);
    return false;
  }

  public processRequests(): void {
    if (this.promises.length === 0) {
      return;
    }

		const creepId = this.promises[0].getCreepId();
		if (this.promises.length > 0 && this.spawns.length > 0 && this.spawns[0].spawning === null) {
			if (this.spawns[0].spawnCreep(this.promises[0].getBody(), creepId) === OK) {
        this.promises[0].setState(CreepPromiseState.CREEP_ALIVE);
				this.promises.shift();
			}
		}
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