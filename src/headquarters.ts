import { Base } from "base/base";
import { CreepHandler } from "./creeps/creep_handler";
import { Logger } from "logging/logger";
import { EntityHandler } from "entity_handler";

export class Headquarters {
  private bases: Map<RoomName, Base> = new Map();
  private creepHandlerMap: Map<string, CreepHandler> = new Map();

  private constructor() {}

  public setUpBases(): void {
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

  /** Handles creating and destorying creep handlers based on what is present in the game. */
  // private sortCreeps(): void {

  //   // Create new handlers
  //   for (let creepName in Game.creeps) {
  //     let creep: Creep = Game.creeps[creepName];
  //     if (!this.creepHandlerMap.has(creepName)) {
  //       const handler = CreepHandlerFactory.createHandlerFromCreep(creep);
  //       const baseId = handler.getRoomName();

  //       let base = this.bases.get(baseId);
  //       if (!base) {
  //         Logger.warning(`Unable to find base ${baseId} to add creep ${creep.name}`);
  //       } else {
  //         base.AddCreepHandler(handler);
  //       }
  //       this.creepHandlerMap.set(creepName, handler);
  //     } else {
  //       // Update existing handlers to have current creep reference
  //       let handler = this.creepHandlerMap.get(creepName);
  //       if (handler) {
  //         handler.setCreep(creep);
  //       }
  //     }
  //   }

  //   // Delete dead creeps
  //   for (let creepName in Memory.creeps) {
  //     if(!Game.creeps[creepName]) {
  //       // TODO: Create a more robust linking/unlinking for creeps
  //       let creepMemory = Memory.creeps[creepName];
  //       let baseId = creepMemory.owningRoomId;
  //       if (baseId in this.bases) {
  //         this.bases.get(baseId)!.RemoveCreepHandler(creepName);
  //       }

  //       if (this.creepHandlerMap.has(creepName)) {
  //         this.creepHandlerMap.delete(creepName);
  //       }

  //       delete Memory.creeps[creepName];
  //     }
  //   }

  //   // Update handler references
  // }

  public processResourceRequests(entityHandler: EntityHandler): void {
    this.bases.forEach((base) => base.processResourceRequests(entityHandler.getCreepHandlersForBase(base.getRoomName())));
  }

  public run(entityHandler: EntityHandler): void {
    this.bases.forEach((base) => base.run(entityHandler.getCreepHandlersForBase(base.getRoomName())));
  }

  public cleanUp(entityHandler: EntityHandler): void {
    this.bases.forEach((base) => base.cleanUp());
  }

  public static initialize(): Headquarters {
    Logger.info("Initializing hq");
    return new Headquarters();
  }
}
