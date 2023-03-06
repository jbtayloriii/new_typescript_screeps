import { IBase } from "base/base";
import { BaseKind } from "global_types";
import { ITask } from "tasks/task";
import { BasicHarvestTask } from "tasks/basic_harvest_task";
import { BasicUpgradeTask } from "tasks/basic_upgrade_task";
import { CreepRequestHandler } from "resources/creep_request_handler";
import { PromiseManager } from "resources/promise_manager";
import { TaskKind } from "types/task_memory";

export class StarterBase implements IBase {
  private memory: StarterBaseMemory;
	private tasks: Array<ITask>;
  private creepRequestHandler: CreepRequestHandler;

  private constructor(memory: StarterBaseMemory, tasks: Array<ITask>, creepRequestHandler: CreepRequestHandler) {
    this.memory = memory;
    this.tasks = tasks;
    this.creepRequestHandler = creepRequestHandler;
  }

  processResourceRequests(): void {
    this.tasks.forEach(task => task.requestResources(this.creepRequestHandler));
  }

  run(): void {
    this.tasks.forEach(task => task.execute());
  }

  cleanUp(): void {
    //todo
  }

  /**
   * 
   * @param baseMemory The parent base memory to push this base onto
   * @returns 
   */
  static createStarterBase(promiseManager: PromiseManager): StarterBase {
		const firstSpawn = Game.spawns[Object.keys(Game.spawns)[0]];
		const closestSource = firstSpawn.pos.findClosestByPath(FIND_SOURCES);
		const controller = firstSpawn.room.controller;
    if (!closestSource) {
      throw "Unable to create starter base, did not find a nearby Source.";
    }
    if (!controller) {
      throw "Unable to create starter base, did not find a controller.";
    }

    const creepRequestHandler = CreepRequestHandler.fromSpawn(firstSpawn, promiseManager);

		const tasks: Array<ITask> = [
			BasicHarvestTask.createNewTask(closestSource, firstSpawn),
			BasicUpgradeTask.createNewTask(closestSource, controller),
		];

    const tasksMemory = tasks.map(task => task.getMemory());


    const starterBaseMemory: StarterBaseMemory = {
      kind: BaseKind.StarterBase,
      tasksMemory: tasksMemory,
      creepRequestHandlerMemory: creepRequestHandler.getMemory(),
    };
    console.log("Test - creating new starter base");
    return new StarterBase(starterBaseMemory, tasks, creepRequestHandler);
  }

  public getMemory(): StarterBaseMemory {
    return this.memory;
  }

  static deserialize(memory: StarterBaseMemory, promiseManager: PromiseManager): StarterBase {
    const tasks: Array<ITask> = memory.tasksMemory.map(taskMemory => StarterBase.deserializeTask(taskMemory, promiseManager));
    const creepRequestHandler = CreepRequestHandler.deserialize(memory.creepRequestHandlerMemory, promiseManager);
    return new StarterBase(memory, tasks, creepRequestHandler);
  }

  private static deserializeTask(taskMemory: TaskMemory, promiseManager: PromiseManager): ITask {
    if (taskMemory.kind === TaskKind.BasicHarvestTaskKind) {
			return BasicHarvestTask.deserialize(taskMemory as BasicHarvestTaskMemory, promiseManager);
		} else if (taskMemory.kind === TaskKind.BasicUpgradeTaskKind) {
			return BasicUpgradeTask.deserialize(taskMemory as BasicUpgradeTaskMemory, promiseManager);
		}
    throw "Cannot deserialize task in base";
  }
}