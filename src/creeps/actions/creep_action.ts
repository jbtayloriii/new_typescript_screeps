

export interface CreepAction<T extends {creep: Creep}> {
  shouldSwitch(args: T): boolean;
  performAction(args: T): void;
}