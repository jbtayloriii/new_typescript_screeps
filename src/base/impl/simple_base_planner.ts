import { CreepType, CreepWrapper } from "../../creeps/api/creep_wrapper";
import { BasePlanner } from "../api/base_planner";


export class SimpleBasePlanner implements BasePlanner {
  planSpawns(spawns: StructureSpawn[], creeps: CreepWrapper[]): void {
    if (spawns.length == 0) {
      return;
    }

    // Only work with first spawn for simple base
    const spawn = spawns[0];
    if (spawn.spawning) {
      return;
    }

    if (creeps.filter(creep => creeps.getType() === CreepType.BASIC_HARVESTER).length == 0) {
      // try to spawn
    }
  }

  
}