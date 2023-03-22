import { Base } from "base/base";
import { CreepHandler } from "./creeps/creep_handler";
import { CreepHandlerFactory } from "./creeps/creep_handler_factory";

export class Headquarters {
  private creepNameMap: Map<string, RoomId> = new Map();
  private bases: Map<RoomId, Base> = new Map();
  private creepMap: Map<RoomId, CreepHandler[]> = new Map();

  private constructor() {}

  public checkWorld(): void {
    this.setUpBases();
    this.sortCreeps(Game.creeps);
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

  private sortCreeps(creeps: { [creepName: string]: Creep }): void {
    const creepMap = new Map<RoomId, CreepHandler[]>();

    for (let creepName in creeps) {
      const handler = CreepHandlerFactory.createHandlerFromCreep(
        creeps[creepName]
      );
      const roomId = handler.getRoomName();
      if (!creepMap.has(roomId)) {
        creepMap.set(roomId, []);
      }
      creepMap.get(roomId)!.push(handler);
    }

    this.creepMap = creepMap;
  }


  public processResourceRequests(): void {
    this.bases.forEach((base) =>
      base.processResourceRequests(this.getCreeps(base.getRoomId()))
    );
  }

  public run(): void {
    this.bases.forEach((base) => {
      base.run(this.getCreeps(base.getRoomId()));
    });
  }

  private getCreeps(roomId: RoomId): CreepHandler[] {
    if (this.creepMap.has(roomId)) {
      return this.creepMap.get(roomId)!;
    }
    console.log(`Unable to get creeps for base ${roomId}`);
    return [];
  }

  public cleanUp(): void {
    this.bases.forEach((base) => base.cleanUp());
  }

  public static initialize(): Headquarters {
    console.log("initializing hq");
    return new Headquarters();
  }
}
