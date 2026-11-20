import { TaskMemory, TaskSpec } from "./types";

/** Typed access to `Memory.tasks`. Takes the Memory object so tests can pass a fake. */
export class TaskStore {
    constructor(private readonly memory: Memory) { }

    getTasks(roomName: RoomName): readonly TaskMemory[] {
        return this.memory.tasks[roomName] ?? [];
    }

    createTask(roomName: RoomName, spec: TaskSpec): TaskMemory {
        // A global counter (not the list length) keeps names unique even after removals.
        const task = { ...spec, name: `${roomName}_${spec.type}_${this.memory.nextTaskId++}`, roomName } as TaskMemory;
        (this.memory.tasks[roomName] ??= []).push(task);
        return task;
    }

    removeTask(roomName: RoomName, taskName: string): boolean {
        const tasks = this.memory.tasks[roomName];
        const index = tasks ? tasks.findIndex(t => t.name === taskName) : -1;
        if (index < 0) {
            return false;
        }
        tasks!.splice(index, 1);
        return true;
    }
}
