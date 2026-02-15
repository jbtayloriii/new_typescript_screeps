import { CreepBlueprint } from "../creeps/creep_blueprint";
import { CreepHandler } from "../creeps/creep_handler";


export interface BasePlanner {
  planConstruction(room: Room): void;

  planCreepCreation(room: Room, baseMemory: BaseMemory, creeps: CreepHandler[]): CreepBlueprint[];
}
