import { BasicHarvestTask } from "./basic_harvest_task";
import { BasicUpgradeTask, UpgradeTaskMemory } from "./basic_upgrade_task";
import { Task, TaskType } from "./task";


/** Static class that (re)creates tasks based on task memory. */
export class TaskFactory {
    static createTaskFromMemory(taskMemory: TaskMemory): Task {
        switch (taskMemory.taskType) {
            case TaskType.BASIC_HARVEST_TASK:
                return new BasicHarvestTask(taskMemory);
            case TaskType.BASIC_UPGRADE_TASK:
                return new BasicUpgradeTask(taskMemory as UpgradeTaskMemory);
            default:
                throw new Error(`Could not determine task to create from type ${taskMemory.taskType}`);
        }
    }

    public static newTask(room: Room, type: TaskType, startingState: number): Task {
        if (!Memory.tasks) {
            Memory.tasks = {};
        }
        if (!Memory.tasks[room.name]) {
            Memory.tasks[room.name] = [];
        }
        if (Memory.nextTaskId === undefined) {
            Memory.nextTaskId = 0;
        }

        // Use a global counter rather than the array length so names are never reused after removal.
        const taskMemory: TaskMemory = {
            name: `${room.name}_${type}_${Memory.nextTaskId++}`,
            roomName: room.name,
            taskType: type,
            currentState: startingState,
        };
        const newTask = this.createTaskFromMemory(taskMemory);
        Memory.tasks[room.name].push(taskMemory);
        return newTask;
    }

    /** Removes the task's memory from its room's task list. Memory.tasks is keyed by room name. */
    public static removeTask(task: Task): boolean {
        const { name, roomName } = task.getMemory();
        const roomTasks = Memory.tasks?.[roomName];
        const index = roomTasks ? roomTasks.findIndex(t => t.name === name) : -1;
        if (index < 0) {
            console.log(`Attempted to delete task without memory: ${name}`);
            return false;
        }
        roomTasks!.splice(index, 1);
        return true;
    }
}
