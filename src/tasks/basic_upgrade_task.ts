import { BaseCreepActions } from "base/base_creep_actions";
import { Task } from "./task";
import { getEnergy } from "creeps/actions/get_energy";
import { upgradeController } from "creeps/actions/upgrade_controller";

export const enum BasicUpgradeTaskState {
    HARVESTING = 0,
    UPGRADING = 1,
}

interface UpgradeTaskMemory extends TaskMemory {
    controllerId: Id<StructureController>;
}

export class BasicUpgradeTask extends Task<UpgradeTaskMemory> {
    private controller: StructureController;

    constructor(taskMemory: UpgradeTaskMemory) {
        super(taskMemory);

        const controller = Game.getObjectById(taskMemory.controllerId);
        if (!controller) {
            throw `Unable to create basic upgrader creep; no controller ${taskMemory.controllerId}`;
        }
        this.controller = controller;
    }

    getSpawnPriority(): number {
        if (this.creeps.length >= 5) {
            return 0;
        }
        return 90 - (this.creeps.length * 4);
    }

    run(creepActions: BaseCreepActions): void {
        if (this.creeps.length < 1) {
            return;
        }



        for (let i = 0; i < this.creeps.length; i++) {
            const nextCreep = this.creeps[i];
            if (nextCreep.spawning) {
                continue;
            }

            // State changes
            if (nextCreep.memory.currentState === BasicUpgradeTaskState.HARVESTING &&
                nextCreep.store[RESOURCE_ENERGY] === nextCreep.store.getCapacity()) {
                nextCreep.memory.currentState = BasicUpgradeTaskState.UPGRADING;
            }

            if (nextCreep.memory.currentState === BasicUpgradeTaskState.UPGRADING &&
                nextCreep.store[RESOURCE_ENERGY] === 0) {
                nextCreep.memory.currentState = BasicUpgradeTaskState.HARVESTING;
            }

            // Performing actions
            if (nextCreep.memory.currentState === BasicUpgradeTaskState.HARVESTING) {
                getEnergy(nextCreep, creepActions);
            } else if (nextCreep.memory.currentState === BasicUpgradeTaskState.UPGRADING) {
                upgradeController(nextCreep, this.controller);
            }
        }
    }
}
