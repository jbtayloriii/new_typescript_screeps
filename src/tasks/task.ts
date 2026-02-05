

export enum TaskType {
    BASIC_HARVEST_TASK = 1,

}

/** Parent class for creating new tasks.
 * 
 * Each task should additionally add its type to the above enum.
 */
export abstract class Task {
    private shouldDelete: boolean = false;

    public taskMemory: TaskMemory;

    private creeps: Creep[] = [];

    constructor(taskMemory: TaskMemory) {
        this.taskMemory = taskMemory;
    }

    // Called once per game loop to get fresh creep object references
    resetCreeps(creeps: Creep[]): void {
        this.creeps = creeps;
    }

    getType(): TaskType {
        return this.taskMemory.taskType;
    }

    abstract run(): void;

    markForDeletion(): void {
        this.shouldDelete = true;
    }

    shouldBeRemoved(): boolean {
        return this.shouldDelete;
    }
}
