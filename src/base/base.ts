import { Logger } from "logging/logger";
import { CreepHandler } from "../creeps/creep_handler";
import { CreepType } from "../creeps/creep_handler_factory";
import { BasePlanner } from "./base_planner";
import { SimpleBasePlanner } from "./simple_base_planner";
import { BaseCreepActions, EnergySources } from "./base_creep_actions";
import { EntityHandler } from "entity_handler";
import { Task } from "tasks/task";
import { TaskFactory } from "tasks/task_factory";
import { basePlanCoordToBuildingObj, coordinateToCoordString } from "utils/string_utils";
import { getBaseLayoutForSpawn } from "pathfinding/base_layout_utils";
import { getLayoutCoordsBetweenLevels } from "pathfinding/base_layout_map_obj";
import { buildRoomSnapshot } from "snapshot/build_snapshot";
import { decideTowerIntents } from "defense/tower_logic";
import { executeIntents } from "intents/execute_intents";

/** How often (in ticks) the base layout is re-applied as construction sites. */
const LAYOUT_REPLAN_INTERVAL = 100;

/**
 * A single owned room.
 *
 * Base instances live across ticks (in the global Headquarters), but game objects and Memory
 * references do not: both are recreated every tick. So a Base only stores its room name and
 * looks up the Room and its BaseMemory fresh on each access.
 */
export class Base {
  private readonly roomName: RoomName;
  private tasks: Task[];

  private constructor(roomName: RoomName, tasks: Task[]) {
    this.roomName = roomName;
    this.tasks = tasks;
  }

  public static createBaseFromInitialSpawn(initialSpawn: StructureSpawn, tasks: Task[]) {
    const roomName = initialSpawn.room.name;
    console.log(`Creating base at room ${roomName} on tick ${Game.time}`);

    if (!(roomName in Memory.bases_v3)) {
      Memory.bases_v3[roomName] = {
        currentControllerLevelPlan: 0,
        lastBaseLayoutPlanTick: 0,
        initialSpawn: coordinateToCoordString(initialSpawn.pos),
        baseLayout: getBaseLayoutForSpawn(initialSpawn),
      };
    }

    return new Base(roomName, tasks);
  }

  public getRoomName(): RoomName {
    return this.roomName;
  }

  /** Returns this tick's Room object, or undefined if the room is no longer visible. */
  private getRoom(): Room | undefined {
    return Game.rooms[this.roomName];
  }

  /** Returns this tick's BaseMemory object. */
  private getBaseMemory(): BaseMemory {
    return Memory.bases_v3[this.roomName];
  }

  public plan(entityHandler: EntityHandler): void {
    const room = this.getRoom();
    if (!room) {
      return;
    }
    const baseMemory = this.getBaseMemory();

    // Re-plan construction on controller level up
    const controllerLevel = room.controller ? room.controller.level : 0;
    if (controllerLevel > baseMemory.currentControllerLevelPlan) {
      baseMemory.lastBaseLayoutPlanTick = 0;
    }

    // Periodically re-apply all unlocked layout levels as construction sites. Re-applying
    // everything (not just newly unlocked levels) retries sites that previously failed, e.g.
    // from the construction site cap, and rebuilds destroyed structures. Sites that already
    // exist just return an error code without costing intent CPU.
    if (Game.time - baseMemory.lastBaseLayoutPlanTick >= LAYOUT_REPLAN_INTERVAL) {
      console.log(`Planning layout for base at ${this.roomName}`);

      const layoutCoords = getLayoutCoordsBetweenLevels(
        baseMemory.baseLayout, /* fromLevelExclusive= */ 0, controllerLevel);

      for (const layoutCoord of layoutCoords) {
        const coordObj = basePlanCoordToBuildingObj(layoutCoord);
        room.createConstructionSite(coordObj.coord.x, coordObj.coord.y, coordObj.structure);
      }

      baseMemory.currentControllerLevelPlan = controllerLevel;
      baseMemory.lastBaseLayoutPlanTick = Game.time;
    }

    // TODO(roadmap phase 2): plan tasks here once tasks replace creep roles.
  }

  processResourceRequests(creepHandlers: CreepHandler[]): void {
    const room = this.getRoom();
    if (!room) {
      Logger.info(`Trying to plan base actions for nonexistent base: ${this.roomName}`);
      return;
    }

    const spawns = room.find(FIND_MY_SPAWNS);
    const validSpawns = spawns.filter((spawn) => !spawn.spawning);
    if (validSpawns.length == 0) {
      return;
    }

    const basePlanner = this.getBasePlanner(room);
    const creepBlueprints = basePlanner.planCreepCreation(room, this.getBaseMemory(), creepHandlers);

    for (const spawn of validSpawns) {
      if (creepBlueprints.length == 0) {
        break;
      }
      const nextBlueprint = creepBlueprints[0];
      const name = [
        CreepType[nextBlueprint.getType()],
        this.roomName,
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
          Logger.warning(`Unable to spawn creep: room ${this.roomName}, body: ${nextBlueprint.getBody()}, type: ${nextBlueprint.getType()}`);
          break;
      }
    }
  }

  private getBasePlanner(room: Room): BasePlanner {
    // TODO: add more base planner types here
    return new SimpleBasePlanner();
  }

  run(creepHandlers: CreepHandler[]): void {
    const room = this.getRoom();
    if (!room) {
      return;
    }

    const creepActions: BaseCreepActions = {
      baseRoomName: this.roomName,
      energySources: this.getEnergySources(room),
    };

    creepHandlers.forEach((handler) => {
      handler.handle(creepActions);
    });

    const snapshot = buildRoomSnapshot(room);
    executeIntents(decideTowerIntents(snapshot));
  }

  private getEnergySources(room: Room): EnergySources {
    const storages = room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType == STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] >= 100 }) as StructureStorage[];
    const containers = room.find(FIND_STRUCTURES, { filter: (s) => s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] >= 100 }) as StructureContainer[];
    const sources = room.find(FIND_SOURCES);

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
