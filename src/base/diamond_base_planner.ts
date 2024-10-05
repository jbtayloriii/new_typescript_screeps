import { CreepBlueprint } from "creeps/creep_blueprint";
import { CreepHandler } from "creeps/creep_handler";
import { BaseMemory } from "memory/base_memory";
import { BasePlanner } from "./base_planner";


export class DiamondBasePlanner implements BasePlanner {
    planConstruction(room: Room): void {
        throw new Error("Method not implemented.");
    }
    planCreepCreation(room: Room, baseMemory: BaseMemory, creeps: CreepHandler[]): CreepBlueprint[] {
        throw new Error("Method not implemented.")
    }
}