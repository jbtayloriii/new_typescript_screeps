import { Logger } from "logging/logger";
import { CreepHandler } from "../creeps/creep_handler";
import { CreepType } from "../creeps/creep_handler_factory";
import { BasePlanner } from "./base_planner";
import { SimpleBasePlanner } from "./simple_base_planner";
import { BaseCreepActions, EnergySources } from "./base_creep_actions";
import { BaseMemory } from "memory/base_memory";
import { MemoryCache } from "memory/memory_cache";

export class Base {
  // private roomPlan: RoomPlan;
  private room: Room;
  private baseMemory: BaseMemory;

  private constructor(room: Room, baseMemory: BaseMemory) {
    this.room = room;
    this.baseMemory = baseMemory;
  }

  public static createBaseFromRoom(room: Room) {
    Logger.info(`Creating base at room ${room.name} on tick ${Game.time}`);
    let baseMemory = MemoryCache.getBaseMemory(room);
    return new Base(room, baseMemory);
  }

  public getRoomName(): RoomName {
    return this.room.name;
  }

  processResourceRequests(creepHandlers: CreepHandler[]): void {
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

    const creepBlueprints = basePlanner.planCreepCreation(room, creepHandlers);

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
    let storages = this.room.find(FIND_MY_STRUCTURES, {filter: (s) => {return s.structureType == STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] >= 100;}}) as StructureStorage[];
    let containers = this.room.find(FIND_STRUCTURES, {filter: (s) => {return s.structureType == STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] >= 100;}}) as StructureContainer[];
    let sources = this.room.find(FIND_SOURCES);

    return {
      storage: storages.length > 0 ? storages[0]: null,
      containers: containers.length > 0 ? containers : null,
      sources: sources,
    };
  }

  cleanUp(): void {}
}
