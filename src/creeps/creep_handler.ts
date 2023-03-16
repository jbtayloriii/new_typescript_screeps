import { CreepType } from "./creep_handler_factory";


export abstract class CreepHandler {
  protected creep: Creep;
  private roomId: RoomId;

  constructor(creep: Creep) {
    this.creep = creep;
    this.roomId = creep.memory.owningRoomId;
  }

  getCreep(): Creep {
    return this.creep;
  }

  getRoomName(): RoomId {
    return this.roomId;
  }

  getType(): CreepType {
    return this.creep.memory.creepType;
  }

  abstract handle(): boolean;
}