import { CreepHandler } from "../creeps/creep_handler";
import { CreepType } from "../creeps/creep_handler_factory";
import { BasePlanner } from "./base_planner";
import { SimpleBasePlanner } from "./simple_base_planner";

export class Base {
  private roomId: RoomId;

  private constructor(roomId: RoomId) {
    this.roomId = roomId;
  }

  public static createBaseFromRoom(room: Room) {
    console.log(`Creating base at room ${room.name} on tick ${Game.time}`);
    return new Base(room.name);
  }

  public getRoomId(): RoomId {
    return this.roomId;
  }

  processResourceRequests(creeps: CreepHandler[]): void {
    if (!Game.rooms[this.roomId]) {
      console.log(
        `Trying to plan base actions for nonexistent base: ${this.roomId}`
      );
      return;
    }
    const room = Game.rooms[this.roomId];

    // TODO: pass in
    const spawns = room.find(FIND_MY_STRUCTURES, {
      filter: { structureType: STRUCTURE_SPAWN },
    }) as StructureSpawn[];

    const validSpawns = spawns.filter((spawn) => !spawn.spawning);
    if (validSpawns.length == 0) {
      console.log("No valid spawns, skipipng process resource reqs");
      return;
    }

    const basePlanner = this.getBasePlanner(room);

    basePlanner.planConstruction(room);

    const creepBlueprints = basePlanner.planCreepCreation(room, creeps);

    for (let spawn of validSpawns) {
      if (creepBlueprints.length > 0) {
        const nextBlueprint = creepBlueprints[0];
        const name = [
          CreepType[nextBlueprint.getType()],
          this.roomId,
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
    creeps.forEach((handler) => {
      handler.handle();
    });
  }

  cleanUp(): void {}
}
