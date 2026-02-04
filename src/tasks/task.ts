

export enum TaskType {

}

/** Base interface for creating new tasks.
 * 
 * Each task should additionally add its type to the above enum.
 */
export interface Task {
    getType(): TaskType;

}
