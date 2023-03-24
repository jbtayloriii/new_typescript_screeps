import { CreepBlueprint } from "../creeps/creep_blueprint";
import { CreepHandler } from "../creeps/creep_handler";
import { CreepType } from "../creeps/creep_handler_factory";
import { BasicBuilderCreepBlueprint } from "../creeps/types/basic_builder_creep";
import { BasicHarvesterCreepBlueprint } from "../creeps/types/basic_harvester_creep";
import { BasicUpgraderCreepBlueprint } from "../creeps/types/basic_upgrader_creep";
import { BasePlanner } from "./base_planner";
import { PowerCreepConstructionPlanning } from "./construction_planning/power_creep_construction_planning";

export class SimpleBasePlanner implements BasePlanner {
  planConstruction(room: Room) {
    if (
      Game.time % 100 == 0 &&
      room.find(FIND_MY_CONSTRUCTION_SITES).length == 0
    ) {
      const powerCreepConstruction = new PowerCreepConstructionPlanning();
      powerCreepConstruction.plan(room);
    }
  }

  planCreepCreation(room: Room, creeps: CreepHandler[]): CreepBlueprint[] {
    const closestSpawnAndSource = this.getSpawnAndClosestSource(room);
    if (!closestSpawnAndSource) {
      return [];
    }

    const harvesterCount = creeps.filter(
      (creep) => creep.getType() === CreepType.BASIC_HARVESTER
    ).length;
    const upgraderCount = creeps.filter(
      (creep) => creep.getType() === CreepType.BASIC_UPGRADER
    ).length;
    const builderCount = creeps.filter(
      (creep) => creep.getType() === CreepType.BASIC_BUILDER
    ).length;

    if (harvesterCount == 0) {
      return [
        new BasicHarvesterCreepBlueprint(
          room,
          closestSpawnAndSource.source,
          closestSpawnAndSource.spawn
        ),
      ];
    }

    const controller = room.controller;
    if (upgraderCount == 0 && controller) {
      return [
        new BasicUpgraderCreepBlueprint(
          room,
          closestSpawnAndSource.source,
          controller
        ),
      ];
    }

    const sites = Object.values(Game.constructionSites).filter(
      (site) => site.room?.name == room.name
    );

    if (sites.length > 0 && builderCount == 0) {
      return [
        new BasicBuilderCreepBlueprint(room, closestSpawnAndSource.source),
      ];
    }

    if (upgraderCount < 3 && controller) {
      return [
        new BasicUpgraderCreepBlueprint(
          room,
          closestSpawnAndSource.source,
          controller
        ),
      ];
    }
    return [];
  }

  /**
   * Returns the first spawn and the closest source to it, for simple base planning.
   */
  private getSpawnAndClosestSource(
    room: Room
  ): { spawn: StructureSpawn; source: Source } | null {
    const spawns = room.find(FIND_MY_SPAWNS);
    if (spawns.length == 0) {
      return null;
    }
    const closestSource = spawns[0].pos.findClosestByPath(FIND_SOURCES);
    if (closestSource) {
      return { spawn: spawns[0], source: closestSource };
    }
    return null;
  }
}
