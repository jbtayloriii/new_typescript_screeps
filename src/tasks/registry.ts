import { buildTask } from "./build_task";
import { claimTask } from "./claim_task";
import { squadTask } from "military/squad_task";
import { haulTask } from "./haul_task";
import { mineTask } from "./mine_task";
import { remoteMineTask } from "./remote_mine_task";
import { repairTask } from "./repair_task";
import { scoutTask } from "./scout_task";
import { TaskDefinition, TaskMemory, TaskType } from "./types";
import { upgradeTask } from "./upgrade_task";

type TaskDefinitions = { [K in TaskType]: TaskDefinition<Extract<TaskMemory, { type: K }>> };

/** Maps each task type to its behavior. Add new task types here. */
const TASK_DEFINITIONS: TaskDefinitions = {
    mine: mineTask,
    haul: haulTask,
    upgrade: upgradeTask,
    build: buildTask,
    repair: repairTask,
    scout: scoutTask,
    remoteMine: remoteMineTask,
    claim: claimTask,
    squad: squadTask,
};

/** Returns the definition for a task, or undefined for an unknown type (e.g. from old Memory). */
export function getTaskDefinition<T extends TaskMemory>(task: T): TaskDefinition<T> | undefined {
    return TASK_DEFINITIONS[task.type] as unknown as TaskDefinition<T> | undefined;
}
