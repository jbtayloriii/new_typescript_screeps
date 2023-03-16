

const ROOM_X_MIN = 0;
const ROOM_X_MAX = 48; // TODO: CHECK
const ROOM_Y_MIX = 0;
const ROOM_Y_MAX = 48; // TODO: CHECK

RoomPosition.prototype.getWalkableNearbySpots = function(this: RoomPosition): RoomPosition[] {
  let roomArr = new Array<RoomPosition>();

  for (let x = Math.max(this.x - 1, ROOM_X_MIN); x <= Math.min(this.x + 1, ROOM_X_MAX); x++) {
    for (let y = Math.max(this.y - 1, ROOM_Y_MIX); y <= Math.min(this.y + 1, ROOM_Y_MAX); y++) {
      if (this.x == x && this.y == y) {
        continue;
      }

      const pos = new RoomPosition(x, y, this.roomName);
      if (pos.lookFor(LOOK_TERRAIN)[0] == 'wall') {
        continue;
      }
      roomArr.push(pos);
    }
  }

  return roomArr;
}

RoomPosition.prototype.serializeStr = function(this: RoomPosition): string {
  return [this.x, this.y, this.roomName].join("_");
}