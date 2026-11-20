import { buildTask } from "./build_task";
import { harvestTask } from "./harvest_task";
import { repairTask } from "./repair_task";
import { TaskDefinition, TaskMemory, TaskType } from "./types";
import { upgradeTask } from "./upgrade_task";

type TaskDefinitions = { [K in TaskType]: TaskDefinition<Extract<TaskMemory, { type: K }>> };

/** Maps each task type to its behavior. Add new task types here. */
const TASK_DEFINITIONS: TaskDefinitions = {
    harvest: harvestTask,
    upgrade: upgradeTask,
    build: buildTask,
    repair: repairTask,
};

/** Returns the definition for a task, or undefined for an unknown type (e.g. from old Memory). */
export function getTaskDefinition<T extends TaskMemory>(task: T): TaskDefinition<T> | undefined {
    return TASK_DEFINITIONS[task.type] as unknown as TaskDefinition<T> | undefined;
}
