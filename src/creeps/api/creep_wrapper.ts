

export enum CreepType {
  BASIC_HARVESTER = 0,
  BASIC_UPGRADER = 1,
}

export interface CreepWrapper {

  getType(): CreepType;
}