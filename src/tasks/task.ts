

export interface ITask {
  execute(): boolean;

  serialize(): TaskMemory;
}