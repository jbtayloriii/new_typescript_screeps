import { BasicHarvestTask } from "./basic_harvest_task";
import { Task, TaskType } from "./task";


/** Static class that (re)creates tasks based on task memory. */
export class TaskFactory {
    static createTaskFromMemory(taskMemory: TaskMemory): Task {
        switch (taskMemory.taskType) {
            case TaskType.BASIC_HARVEST_TASK:
                return new BasicHarvestTask(taskMemory);
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

        const taskMemory: TaskMemory = {
            name: `${room.name}_${type}_${Memory.tasks[room.name].length}`,
            roomName: room.name,
            taskType: type,
            currentState: startingState,
        };
        const newTask = this.createTaskFromMemory(taskMemory);
        Memory.tasks[room.name].push(taskMemory);
        return newTask;
    }

    public static removeTask(task: Task): boolean {
        if (Memory.tasks[task.taskMemory.name]) {
            delete Memory.tasks[task.taskMemory.name];
            return true;
        } else {
            console.log(`Attempted to delete task without memory: ${task.taskMemory.name}`);
            return false;
        }
    }
}
