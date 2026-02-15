import { BaseCreepActions } from "base/base_creep_actions";
import { Task, TaskType } from "./task";
import { getEnergy } from "creeps/actions/get_energy";
import { returnResourceToStructure } from "creeps/actions/return_resource_to_structure";

export const enum BasicHarvestTaskState {
    HARVESTING = 0,
    DROPPING_OFF = 1,
}

export class BasicHarvestTask extends Task {
    private readonly taskMemory: TaskMemory;


    constructor(taskMemory: TaskMemory) {
        super(TaskType.BASIC_HARVEST_TASK);
        this.taskMemory = taskMemory;
    }

    override getMemory(): TaskMemory {
        return this.taskMemory;
    }

    override getSpawnPriority(): number {
        return this.creeps.length < 1 ? 100 : 0;
    }

    override run(creepActions: BaseCreepActions): void {
        if (this.creeps.length < 1) {
            return;
        }

        const creep = this.creeps[0];

        if (creep.spawning) {
            return;
        }

        // state changes
        if (creep.memory.currentState === BasicHarvestTaskState.HARVESTING &&
            creep.store[RESOURCE_ENERGY] === creep.store.getCapacity()) {
            creep.memory.currentState = BasicHarvestTaskState.DROPPING_OFF;
        }

        if (creep.memory.currentState === BasicHarvestTaskState.DROPPING_OFF
            && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.currentState = BasicHarvestTaskState.HARVESTING;
        }

        if (creep.memory.currentState === BasicHarvestTaskState.HARVESTING) {
            getEnergy(creep, creepActions);

        } else if (creep.memory.currentState === BasicHarvestTaskState.DROPPING_OFF) {
            returnResourceToStructure(creep);
        }
    }
}
