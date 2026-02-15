import { Logger } from "logging/logger";
import { CreepHandler } from "../creeps/creep_handler";
import { CreepType } from "../creeps/creep_handler_factory";
import { BasePlanner } from "./base_planner";
import { SimpleBasePlanner } from "./simple_base_planner";
import { BaseCreepActions, EnergySources } from "./base_creep_actions";
import { EntityHandler } from "entity_handler";
import { Task, TaskType } from "tasks/task";
import { TaskFactory } from "tasks/task_factory";
import { BasicHarvestTaskState } from "tasks/basic_harvest_task";
import { coordinateToCoordString } from "utils/string_utils";
import { getBaseLayoutForSpawn } from "pathfinding/base_layout_utils";
import { BasePlanningCoordinateString } from "global_types";

export class Base {
  private room: Room;
  private baseMemory: BaseMemory;
  private tasks: Task[];

  private constructor(room: Room, baseMemory: BaseMemory, tasks: Task[]) {
    this.room = room;
    this.baseMemory = baseMemory;
    this.tasks = tasks;
  }

  public static createBaseFromInitialSpawn(initialSpawn: StructureSpawn, tasks: Task[]) {
    console.log(`Creating base at room ${initialSpawn.room.name} on tick ${Game.time}`);

    if (!(initialSpawn.room.name in Memory.bases_v3)) {
      const baseLayoutMap = getBaseLayoutForSpawn(initialSpawn);

      Memory.bases_v3[initialSpawn.room.name] = {
        currentControllerLevelPlan: 0,
        lastBaseLayoutPlanTick: 0,
        initialSpawn: coordinateToCoordString(initialSpawn.pos),
        baseLayout: baseLayoutMap,
      };
    }
    const baseMemory: BaseMemory = Memory.bases_v3[initialSpawn.room.name];

    return new Base(initialSpawn.room, baseMemory, tasks);
  }

  public getRoomName(): RoomName {
    return this.room.name;
  }

  public plan(entityHandler: EntityHandler): void {
    // Re-plan construction on controller level up
    const controllerLevel = this.room.controller ? this.room.controller.level : 0;
    if (controllerLevel > this.baseMemory.currentControllerLevelPlan) {
      this.baseMemory.lastBaseLayoutPlanTick = 0;
    }


    // Every 100 steps, remap base layout to construction sites.
    if (Game.time - this.baseMemory.lastBaseLayoutPlanTick >= 100) {
      const layoutCoords: BasePlanningCoordinateString[] = [];
      const levelLayouts = this.baseMemory.baseLayout.forEach((v, k) => {
        if (k > this.baseMemory.currentControllerLevelPlan && k <= controllerLevel) {
          layoutCoords.push(...this.baseMemory.baseLayout.get(k)!);
        }
      });

      for (let i = 0; i < layoutCoords.length; i++) {

      }

      this.baseMemory.currentControllerLevelPlan = controllerLevel;
    }



    // Plan tasks
    // TODO: break into separate method, maybe
    if (this.room.controller && this.room.controller.level == 1) {
      let hasHarvestTask = false;
      let hasUpgradeTask = false;
      this.tasks.forEach(task => {
        if (task.getType() == TaskType.BASIC_HARVEST_TASK) {
          hasHarvestTask = true;
        }
        if (task.getType() == TaskType.BASIC_UPGRADE_TASK) {
          hasUpgradeTask = true;
        }
      });

      if (!hasHarvestTask) {
        this.tasks.push(TaskFactory.newTask(this.room, TaskType.BASIC_HARVEST_TASK, BasicHarvestTaskState.HARVESTING));
      }
      if (!hasUpgradeTask) {
        // TODO: add upgrade task here
      }

    }
    // TODO: implement for more levels
  }

  processResourceRequests(creepHandlers: CreepHandler[]): void {
    if (!Game.rooms[this.room.name]) {
      Logger.info(`Trying to plan base actions for nonexistent base: ${this.room.name}`);
      return;
    }
    const room = Game.rooms[this.room.name];

    // TODO 2026: add task prioritizing here

    // TODO: pass in
    const spawns = room.find(FIND_MY_STRUCTURES, {
      filter: { structureType: STRUCTURE_SPAWN },
    }) as StructureSpawn[];

    const validSpawns = spawns.filter((spawn) => !spawn.spawning);
    if (validSpawns.length == 0) {
      Logger.warning("No valid spawns, skipping process resource reqs");
      return;
    }

    const basePlanner = this.getBasePlanner(room);

    if (Game.time % 100 == 0) {
      Logger.info(`Planning construction for ${room.name}`);
      basePlanner.planConstruction(room);
    }

    const creepBlueprints = basePlanner.planCreepCreation(room, this.baseMemory, creepHandlers);

    for (let spawn of validSpawns) {
      if (creepBlueprints.length > 0) {
        const nextBlueprint = creepBlueprints[0];
        const name = [
          CreepType[nextBlueprint.getType()],
          this.room.name,
          Game.time,
        ].join("_");

        const ret = spawn.spawnCreep(nextBlueprint.getBody(), name, {
          memory: nextBlueprint.getInitialMemory(),
        });
        switch (ret) {
          case OK:
            creepBlueprints.shift();
            break;
          case ERR_NOT_ENOUGH_ENERGY:
            Logger.warning(`Unable to spawn creep: room ${this.room.name}, body: ${nextBlueprint.getBody()}, type: ${nextBlueprint.getType()}`)
        }
        if (ret == OK) {
          creepBlueprints.shift();
        }
      }
    }
  }

  private getBasePlanner(room: Room): BasePlanner {
    if (room.controller && room.controller.level < 3) {
      return new SimpleBasePlanner();
    }

    // TODO: add more base planner types here
    return new SimpleBasePlanner();
  }

  run(creepHandlers: CreepHandler[]): void {
    let creepActions: BaseCreepActions = {
      baseRoomName: this.room.name,
      energySources: this.getEnergySource(),
    }


    creepHandlers.forEach((handler) => {
      handler.handle(creepActions);
    });
  }

  private getEnergySource(): EnergySources {
    let storages = this.room.find(FIND_MY_STRUCTURES, { filter: (s) => { return s.structureType == STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] >= 100; } }) as StructureStorage[];
    let containers = this.room.find(FIND_STRUCTURES, { filter: (s) => { return s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] >= 100; } }) as StructureContainer[];
    let sources = this.room.find(FIND_SOURCES);

    return {
      storage: storages.length > 0 ? storages[0] : null,
      containers: containers.length > 0 ? containers : null,
      sources: sources,
    };
  }

  cleanUp(): void {

    // Remove dead tasks
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      const task = this.tasks[i];
      if (task.shouldBeRemoved()) {
        TaskFactory.removeTask(task);
        this.tasks.splice(i, 1);
      }
    }
  }
}
