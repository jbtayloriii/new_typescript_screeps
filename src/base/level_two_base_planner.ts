import { CreepBlueprint } from "../creeps/creep_blueprint";
import { CreepHandler } from "../creeps/creep_handler";
import { BasePlanner } from "./base_planner";

export class LevelTwoBasePlanner implements BasePlanner {
  planConstruction(room: Room) {
    throw 'method not implemented'
  }

  planCreepCreation(room: Room, creeps: CreepHandler[]): CreepBlueprint[] {
    throw new Error("Method not implemented.");
  }

}