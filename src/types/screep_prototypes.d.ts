import { CreepMoveStatus } from "../prototypes/creep_prototype";

export { }

declare global {
  interface Creep {
    FindAndMoveOnPath(targetPos: RoomPosition, range: number): CreepMoveStatus;
  }

  interface Room {
    getSourcesAndOpenSpots(): {
      source: Source,
      openSpots: number,
    }[];
    addCreepToSource(creep: Creep, source: Source): boolean;
    removeCreepFromSource(creep: Creep, source: Source): boolean;
  }

  interface RoomPosition {
    getWalkableNearbySpots(): RoomPosition[];

    serializeStr(): string;
  }

  interface StructureTower {
    repairStructures(): void;
    attackEnemy(): boolean;
  }
}