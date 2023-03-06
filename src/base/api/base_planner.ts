import { CreepWrapper } from "../../creeps/api/creep_wrapper";


export interface BasePlanner {
  planSpawns(spawns: StructureSpawn[], creeps: CreepWrapper[]): void;
}