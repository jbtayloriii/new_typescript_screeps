import { CreepRequestHandler } from "resources/creep_request_handler";


export interface ITask {
  requestResources(requestHandler: CreepRequestHandler): void;

  execute(): boolean;

  getMemory(): TaskMemory;
}