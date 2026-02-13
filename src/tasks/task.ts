import { BaseCreepActions } from "base/base_creep_actions";


export enum TaskType {
    BASIC_HARVEST_TASK = 1,
    BASIC_UPGRADE_TASK = 2,
}

/** Parent class for creating new tasks.
 * 
 * Each task should additionally add its type to the above enum.
 */
export abstract class Task<M extends TaskMemory> {
    private shouldDelete: boolean = false;

    public taskMemory: M;

    protected creeps: Creep[] = [];

    constructor(taskMemory: M) {
        this.taskMemory = taskMemory;
    }

    // Called once per game tick to get fresh creep object references
    resetCreeps(creeps: Creep[]): void {
        this.creeps = creeps;
    }

    getType(): TaskType {
        return this.taskMemory.taskType;
    }

    /** Runs the task. This method should be overridden by subclasses. */
    abstract run(creepActions: BaseCreepActions): void;

    abstract getSpawnPriority(): number;

    markForDeletion(): void {
        this.shouldDelete = true;
    }

    shouldBeRemoved(): boolean {
        return this.shouldDelete;
    }
}
