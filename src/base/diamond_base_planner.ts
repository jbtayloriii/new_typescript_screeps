import { CreepBlueprint } from "creeps/creep_blueprint";
import { CreepHandler } from "creeps/creep_handler";
import { BasePlanner } from "./base_planner";


export class DiamondBasePlanner implements BasePlanner {
    planConstruction(room: Room): void {
        throw new Error("Method not implemented.");
    }
    planCreepCreation(room: Room, creeps: CreepHandler[]): CreepBlueprint[] {
        throw new Error("Method not implemented.")
    }
}