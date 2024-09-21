import { BaseCreepActions } from "base/base_creep_actions";
import { CreepType } from "./creep_handler_factory";


export abstract class CreepHandler {
  protected creep: Creep;
  private roomId: RoomName;

  constructor(creep: Creep) {
    this.creep = creep;
    this.roomId = creep.memory.owningRoomId;
  }

  getCreep(): Creep {
    return this.creep;
  }

  getRoomName(): RoomName {
    return this.roomId;
  }

  getType(): CreepType {
    return this.creep.memory.creepType;
  }

  /** Handles this creep's actions for the turn.
   * 
   * @param creepActions: A set of APIs allowing the Creep to interact upward with its Base
   */
  abstract handle(creepActions: BaseCreepActions): void;
}