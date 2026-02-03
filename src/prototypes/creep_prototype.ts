import { CreepType } from "creeps/creep_handler_factory";


export const enum CreepMoveStatus {
  NO_PATH = 0,
  ON_PATH = 1,
  FINISHED = 2,
}

Creep.prototype.FindAndMoveOnPath = function (this: Creep, targetPos: RoomPosition, range: number): CreepMoveStatus {
  if (!this.memory._movePath || this.memory._moveTargetPosSerial !== targetPos.serializeStr()) {
    const movePath = this.room.findPath(this.pos, targetPos, {
      serialize: false,
      range: range,
      ignoreCreeps: true,
    });

    console.log(`found path with ${movePath.length} segments`);

    this.memory._movePath = Room.serializePath(movePath);
    this.memory._moveTargetPosSerial = targetPos.serializeStr();
  }

  const moveCode = this.moveByPath(this.memory._movePath);

  if (moveCode == ERR_NOT_FOUND) {
    return CreepMoveStatus.NO_PATH;
  }
  return CreepMoveStatus.ON_PATH;
}

/** Has the creep say its job emoji, followed by the emoji of its current action. */
Creep.prototype.SayJobAction = function (this: Creep, action: string): void {
  if (!this.memory.creepType) {
    return;
  }
  const job: string = creepTypeToJobEmoji(this.memory.creepType);
  this.say(`${job}: ${action}`);
}

// https://emojidb.org/ is a good engine for looking up new emojis
function creepTypeToJobEmoji(creepType: CreepType): string {
  switch (creepType) {
    case CreepType.BASIC_BUILDER:
      return '🛠️';
    case CreepType.BASIC_HARVESTER:
      return '⛏️';
    case CreepType.BASIC_UPGRADER:
      return '💪';
    case CreepType.POWER_HARVESTER:
      return '⚡️⛏️';
    case CreepType.BASIC_REPAIRER:
      return '🩹';
    default:
      return ''
  }
}
