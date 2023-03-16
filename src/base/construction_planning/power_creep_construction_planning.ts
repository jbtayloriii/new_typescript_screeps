import { ConstructionPlanning } from "../construction_planning";


export class PowerCreepConstructionPlanning implements ConstructionPlanning {
  constructor() {

  }

  plan(room: Room): void {
    const mem = room.memory;
    if (!mem.powerHarvestingMap) {
      mem.powerHarvestingMap = {};
    }

    const spawns = room.find(FIND_MY_SPAWNS);
    if (spawns.length == 0) {
      return;
    }

    for (let source of room.find(FIND_SOURCES) as Array<Source>) {
      if (!(source.id in mem.powerHarvestingMap)) {
        const containerPos = this.createPowerHarvestingPath(room, spawns[0], source);

        mem.powerHarvestingMap[source.id] = containerPos;
        return;
      }
    }
  }

  private createPowerHarvestingPath(room: Room, start: Structure, end: Source) {
    const pathArr = PathFinder.search(start.pos, {pos: end.pos, range: 1}).path;
    for (let pathPos of pathArr) {
      if (pathPos.isEqualTo(start.pos) || pathPos.isEqualTo(end.pos)) {
        continue;
      }

      const look = pathPos.look;
      if (this.shouldAddRoad(pathPos, end)) {
        pathPos.createConstructionSite(STRUCTURE_ROAD);
      }
    }

    // Add a container to the end of the path
    pathArr[pathArr.length - 1].createConstructionSite(STRUCTURE_CONTAINER);

    return pathArr[pathArr.length - 1];
  }

  private shouldAddRoad(pos: RoomPosition, source: Source): boolean {
    for (let lookObj of pos.look()) {
      if (lookObj.type == LOOK_CONSTRUCTION_SITES && lookObj[LOOK_CONSTRUCTION_SITES]?.structureType == STRUCTURE_ROAD) {
        return false;
      }
      if (lookObj.type == LOOK_STRUCTURES && lookObj[LOOK_STRUCTURES]?.structureType == STRUCTURE_ROAD ) {
        return false;
      }
    }

    return true;
  }
}