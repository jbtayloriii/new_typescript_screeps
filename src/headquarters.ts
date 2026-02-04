import { Base } from "base/base";
import { CreepHandler } from "./creeps/creep_handler";
import { Logger } from "logging/logger";
import { EntityHandler } from "entity_handler";

export class Headquarters {
  private bases: Map<RoomName, Base> = new Map();
  private creepHandlerMap: Map<string, CreepHandler> = new Map();

  private constructor() { }

  public setUpBases(): void {
    // TODO: remove bases that are destroyed

    const owningRooms = Object.entries(Game.rooms).filter(
      ([roomName, room]) => room.controller && room.controller.my
    );
    for (let [roomName, room] of owningRooms) {
      if (!this.bases.has(roomName)) {
        console.log(`Creating base at ${roomName}`);
        this.bases.set(roomName, Base.createBaseFromRoom(room));
      }
    }
  }

  public plan(entityHandler: EntityHandler): void {
    this.bases.forEach(base => base.plan(entityHandler));
  }

  public processResourceRequests(entityHandler: EntityHandler): void {
    this.bases.forEach(base => base.processResourceRequests(entityHandler.getCreepHandlersForBase(base.getRoomName())));
  }

  public run(entityHandler: EntityHandler): void {
    this.bases.forEach(base => base.run(entityHandler.getCreepHandlersForBase(base.getRoomName())));
  }

  public cleanUp(entityHandler: EntityHandler): void {
    this.bases.forEach(base => base.cleanUp());
  }

  public static initialize(): Headquarters {
    Logger.info("Initializing hq");
    return new Headquarters();
  }
}
