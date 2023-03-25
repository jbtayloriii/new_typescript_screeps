import { ConstructionPlanning } from "../construction_planning";

export class PowerCreepConstructionPlanning implements ConstructionPlanning {
  constructor() {}

  plan(room: Room): void {
    const spawns = room.find(FIND_MY_SPAWNS);
    if (spawns.length == 0) {
      return;
    }

    for (let source of room.find(FIND_SOURCES) as Array<Source>) {
      const nearbyContainers = source.pos.findInRange(
        FIND_MY_STRUCTURES,
        /* range= */ 1,
        {
          filter: { structureType: STRUCTURE_CONTAINER },
        }
      );
      const nearbyContainerSites = source.pos.findInRange(
        FIND_MY_CONSTRUCTION_SITES,
        /* range= */ 1,
        {
          filter: { structureType: STRUCTURE_CONTAINER },
        }
      );

      if (nearbyContainers.length == 0 && nearbyContainerSites.length == 0) {
        this.createPowerHarvestingPath(room, spawns[0], source);

        return;
      }
    }
  }

  private createPowerHarvestingPath(room: Room, start: Structure, end: Source) {
    const pathArr = PathFinder.search(start.pos, {
      pos: end.pos,
      range: 1,
    }).path;

    pathArr[pathArr.length - 1].createConstructionSite(STRUCTURE_CONTAINER);
    for (let pathPos of pathArr) {
      if (pathPos.isEqualTo(start.pos) || pathPos.isEqualTo(end.pos)) {
        continue;
      }

      const look = pathPos.look;
      if (this.shouldAddRoad(pathPos, end)) {
        pathPos.createConstructionSite(STRUCTURE_ROAD);
      }
    }

    return pathArr[pathArr.length - 1];
  }

  private shouldAddRoad(pos: RoomPosition, source: Source): boolean {
    for (let lookObj of pos.look()) {
      if (
        lookObj.type == LOOK_CONSTRUCTION_SITES &&
        lookObj[LOOK_CONSTRUCTION_SITES]?.structureType == STRUCTURE_ROAD
      ) {
        return false;
      }
      if (
        lookObj.type == LOOK_STRUCTURES &&
        lookObj[LOOK_STRUCTURES]?.structureType == STRUCTURE_ROAD
      ) {
        return false;
      }
    }

    return true;
  }
}
