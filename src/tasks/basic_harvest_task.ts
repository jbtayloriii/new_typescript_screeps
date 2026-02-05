import { Task, TaskType } from "./task";

const enum BasicHarvestTaskState {
    HARVESTING = 0,
    DROPPING_OFF = 1,
}

export class BasicHarvestTask extends Task {
    constructor(taskMemory: TaskMemory) {
        super(taskMemory);
    }

    run(): void {
        // state changes
        if (this.taskMemory.currentState === BasicHarvestTaskState.HARVESTING &&
            this.creep.store[RESOURCE_ENERGY] === this.creep.store.getCapacity()) {
            this.taskMemory.currentState = BasicHarvestTaskState.DROPPING_OFF;
        }

        if (this.memory.currentState === BasicHarvestTaskState.DROPPING_OFF
            && this.creep.store[RESOURCE_ENERGY] === 0) {
            this.memory.currentState = BasicHarvestTaskState.HARVESTING;
        }

        if (this.memory.currentState === BasicHarvestTaskState.HARVESTING) {
            getEnergy(this.creep, creepActions);

        } else if (this.memory.currentState === BasicHarvestTaskState.DROPPING_OFF) {
            returnResourceToStructure(this.creep);
        }
    }
}
