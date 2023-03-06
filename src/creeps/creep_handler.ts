

export interface CreepHandler {
  getCreep(): Creep;

  handle(): void;
}