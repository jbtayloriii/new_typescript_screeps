import { CreepPromise } from "./promises/creep_promise";


export interface CreepRequestHandler {
  addPromise(newPromise: CreepPromise): boolean;
  
  hasPromise(promiseId: boolean): boolean;

  processRequests(): void;
}