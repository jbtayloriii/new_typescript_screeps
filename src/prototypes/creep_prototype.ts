

export const enum CreepMoveStatus {
  NO_PATH = 0,
  ON_PATH = 1,
  FINISHED = 2,
}

Creep.prototype.FindAndMoveOnPath = function(this: Creep, targetPos: RoomPosition, range: number): CreepMoveStatus {
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