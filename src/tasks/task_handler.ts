import { Task } from "./task";


/** Singleton that handles creating and destroying tasks.
 * 
 * This class passes around task sets for each base/room in order to keep everything in sync.
 * Each base's individual set of tasks should be a reference to arrays in this object.
 */
export class TaskHandler {
    private taskToRoomMap = new Map<RoomName, Task[]>();

    public constructor() { }

    public updateCreepToTasks(creeps: { [creepName: string]: Creep }): void {

        // Sort creeps by task name
        const creepsByTaskName = new Map<string, Creep[]>();
        for (const creepName in creeps) {
            const taskName = creeps[creepName].memory.taskName;
            if (!creepsByTaskName.has(taskName)) {
                creepsByTaskName.set(taskName, []);
            }
            creepsByTaskName.get(taskName)?.push(creeps[creepName]);
        }

        // Pass in fresh creep references
        for (const [roomName, tasks] of this.taskToRoomMap) {
            tasks.forEach(task => {
                if (creepsByTaskName.has(task.taskMemory.name)) {
                    task.resetCreeps(creepsByTaskName.get(task.taskMemory.name)!);
                }
            });
        }
    }
}
