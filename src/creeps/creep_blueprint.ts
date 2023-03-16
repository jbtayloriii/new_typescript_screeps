import { CreepType } from "./creep_handler_factory";

export abstract class CreepBlueprint {
  protected owningRoomId: string;

  constructor(room: Room) {
    this.owningRoomId = room.name;
  }

  abstract getBody(): BodyPartConstant[];
  abstract getType(): CreepType;
  abstract getInitialMemory(): CreepMemory;
}