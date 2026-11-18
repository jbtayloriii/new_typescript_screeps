import { CreepMoveStatus } from "./creep_prototype";

export { }

declare global {
  interface Creep {
    FindAndMoveOnPath(targetPos: RoomPosition, range: number): CreepMoveStatus;
    SayJobAction(action: string): void;
  }

  interface RoomPosition {
    getWalkableNearbySpots(): RoomPosition[];

    serializeStr(): string;
  }
}
