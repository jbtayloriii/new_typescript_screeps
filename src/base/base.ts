import { Logger } from "logging/logger";
import { CreepHandler } from "../creeps/creep_handler";
import { CreepType } from "../creeps/creep_handler_factory";
import { BasePlanner } from "./base_planner";
import { SimpleBasePlanner } from "./simple_base_planner";
import { BaseCreepActions, EnergySources } from "./base_creep_actions";

export class Base {
  // private roomPlan: RoomPlan;
  private room: Room;

  private constructor(room: Room) {
    this.room = room;
  }

  public static createBaseFromRoom(room: Room) {
    Logger.info(`Creating base at room ${room.name} on tick ${Game.time}`);
    return new Base(room);
  }

  public getRoomName(): RoomName {
    return this.room.name;
  }

  processResourceRequests(creeps: CreepHandler[]): void {
    if (!Game.rooms[this.room.name]) {
      Logger.info(`Trying to plan base actions for nonexistent base: ${this.room.name}`);
      return;
    }
    const room = Game.rooms[this.room.name];

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

    const creepBlueprints = basePlanner.planCreepCreation(room, creeps);

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

  run(creeps: CreepHandler[]): void {
    let creepActions: BaseCreepActions = {
      baseRoomName: this.room.name,
      energySources: this.getEnergySource(),
    }


    creeps.forEach((handler) => {
      handler.handle(creepActions);
    });
  }

  private getEnergySource(): EnergySources {
    console.log("Debug: Calling getEnergySource on tick " + Game.time);

    let storages = this.room.find(FIND_MY_STRUCTURES, {filter: (s) => {return s.structureType == STRUCTURE_STORAGE;}}) as StructureStorage[];
    if (storages.length > 0) {
      return {
        storage: storages[0],
        containers: null,
        sources: null,
      }
    }
    
    // Assumes containers are all power harvesting containers
    let containers = this.room.find(FIND_STRUCTURES, {filter: (s) => {return s.structureType == STRUCTURE_CONTAINER;}}) as StructureContainer[];
    if (containers.length > 0) {
      return {
        storage: null,
        containers: containers,
        sources: null,
      }
    }

    return {
      storage: null,
      containers: null,
      sources: this.room.find(FIND_SOURCES),
    };
  }

  cleanUp(): void {}
}
