import { Base } from "base/base";
import { CreepHandler } from "./creeps/creep_handler";
import { CreepHandlerFactory } from "./creeps/creep_handler_factory";

export class Headquarters {
  private creepNameMap: Map<string, RoomId> = new Map();
  private bases: Map<RoomId, Base> = new Map();

  private constructor() {}

  public checkWorld(): void {
    this.setUpBases();
    this.addCreepsToRooms();
    this.removeDeadCreeps();
  }

  private setUpBases(): void {
    // TODO: remove bases that are destroyed

    const owningRooms = Object.entries(Game.rooms).filter(
      ([roomName, room]) => room.controller && room.controller.my
    );
    for (let [roomName, room] of owningRooms) {
      if (!this.bases.has(roomName)) {
        this.bases.set(roomName, Base.createBaseFromRoom(room));
      }
    }
  }

  private addCreepsToRooms(): void {
    for (let [creepName, creep] of Object.entries(Game.creeps)) {
      if (!this.creepNameMap.has(creep.name)) {
        const creepHandler = CreepHandlerFactory.createHandlerFromCreep(creep);
        const roomId = creepHandler.getRoomName();
        this.creepNameMap.set(creep.name, roomId);
        if (this.bases.has(roomId)) {
          this.bases.get(roomId)!.addCreep(creepHandler);
        } else {
          console.log(
            `Trying to add creep ${creep.name} to nonexistent base ${roomId}`
          );
        }
      }
    }
  }

  private removeDeadCreeps(): void {
    for (const name in Memory.creeps) {
      if (!(name in Game.creeps)) {
        delete Memory.creeps[name];
        const roomId = this.creepNameMap.get(name) ?? null;
        if (roomId && this.bases.has(roomId)) {
          this.bases.get(roomId)!.removeDeadCreepHandler(name);
          this.creepNameMap.delete(name);
        }
      }
    }
  }

  public processResourceRequests(): void {
    this.bases.forEach((base) => base.processResourceRequests());
  }

  public run(): void {
    this.bases.forEach((base) => base.run());
  }

  public cleanUp(): void {
    this.bases.forEach((base) => base.cleanUp());
  }

  public static initialize(): Headquarters {
    return new Headquarters();
  }
}
