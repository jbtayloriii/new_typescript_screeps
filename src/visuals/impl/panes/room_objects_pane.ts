

export class RoomObjectsPane {
  

  draw(room: Room): void {
    const controller = room.controller;
    if (controller === undefined) {
      return;
    }
    const level: number = controller.level;

  }
}