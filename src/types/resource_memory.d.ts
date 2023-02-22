export const enum PromiseKind {
  UNKNOWN = 0,
  CREEP_PROMISE = 1,
}

type PromiseId = string;

declare global {

  interface CreepRequestHandlerMemory {
    spawnIds: Id<StructureSpawn>[];
    promiseIds: PromiseId[];
  }

  interface PromiseMemory {
    kind: PromiseKind;
    promiseId: PromiseId;
  }

  interface CreepPromiseMemory extends PromiseMemory {
    kind: PromiseKind.CREEP_PROMISE;
    body: BodyPartConstant[];
    creepId: string;
  }
}