import { IBase } from "base/base";
import { BaseKind } from "global_types";
import { ITask } from "tasks/task";
import { BasicHarvestTask } from "tasks/basic_harvest_task";
import { BasicUpgradeTask } from "tasks/basic_upgrade_task";

export class StarterBase implements IBase {
  private memory: StarterBaseMemory;
	// private requester: ResourceRequester;
	private tasks: Array<ITask>;

  private constructor(memory: StarterBaseMemory, tasks: Array<ITask>) {
    this.memory = memory;
    this.tasks = tasks;
  }

  processResourceRequests(): void {
    throw "unimplemented";
  }

  run(): void {
		// for (const task of this.tasks) {
		// 	task.execute();
		// }
  }

  static createStarterBase(baseMemory: Array<BaseMemory>): StarterBase {
		const firstSpawn = Game.spawns[Object.keys(Game.spawns)[0]];
		const closestSource = firstSpawn.pos.findClosestByPath(FIND_SOURCES);
		const controller = firstSpawn.room.controller;
    if (!closestSource) {
      throw "Unable to create starter base, did not find a nearby Source.";
    }
    if (!controller) {
      throw "Unable to create starter base, did not find a controller.";
    }

		const tasks: Array<ITask> = [
			BasicHarvestTask.createNewTask( closestSource, firstSpawn),
			BasicUpgradeTask.createNewTask(closestSource, controller),
		];

    const tasksMemory = tasks.map(task => task.serialize());

    const starterBaseMemory: StarterBaseMemory = {
      kind: BaseKind.StarterBase,
      test: "starter test",
      tasksMemory: tasksMemory,
    };
    console.log("Test - creating new starter base");
    baseMemory.push(starterBaseMemory);
    return new StarterBase(starterBaseMemory, tasks);
  }

  static deserialize(memory: StarterBaseMemory): StarterBase {
    // TODO: deserialize tasks from memory
    const tasks: Array<ITask> = [];
    return new StarterBase(memory, tasks);
  }
}