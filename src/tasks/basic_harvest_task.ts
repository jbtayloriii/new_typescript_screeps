import { BaseCreepActions } from "base/base_creep_actions";
import { Task } from "./task";
import { getEnergy } from "creeps/actions/get_energy";
import { returnResourceToStructure } from "creeps/actions/return_resource_to_structure";

export const enum BasicHarvestTaskState {
    HARVESTING = 0,
    DROPPING_OFF = 1,
}

export class BasicHarvestTask extends Task<TaskMemory> {
    constructor(taskMemory: TaskMemory) {
        super(taskMemory);
    }

    getSpawnPriority(): number {
        return this.creeps.length < 1 ? 100 : 0;
    }

    run(creepActions: BaseCreepActions): void {
        if (this.creeps.length < 1) {
            return;
        }

        const creep = this.creeps[0];

        if (creep.spawning) {
            return;
        }

        // state changes
        if (this.taskMemory.currentState === BasicHarvestTaskState.HARVESTING &&
            creep.store[RESOURCE_ENERGY] === creep.store.getCapacity()) {
            this.taskMemory.currentState = BasicHarvestTaskState.DROPPING_OFF;
        }

        if (this.taskMemory.currentState === BasicHarvestTaskState.DROPPING_OFF
            && creep.store[RESOURCE_ENERGY] === 0) {
            this.taskMemory.currentState = BasicHarvestTaskState.HARVESTING;
        }

        if (this.taskMemory.currentState === BasicHarvestTaskState.HARVESTING) {
            getEnergy(creep, creepActions);

        } else if (this.taskMemory.currentState === BasicHarvestTaskState.DROPPING_OFF) {
            returnResourceToStructure(creep);
        }
    }
}
