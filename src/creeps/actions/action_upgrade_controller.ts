import { CreepAction } from "./creep_action";

export const ActionUpgradeController: CreepAction<{
  creep: Creep;
  controller: StructureController;
}> = {
  shouldSwitch: function (args: {
    creep: Creep;
    controller: StructureController;
  }): boolean {
    if (args.creep.store[RESOURCE_ENERGY] == 0) {
      return true;
    }
    return false;
  },

  performAction: function (args: {
    creep: Creep;
    controller: StructureController;
  }): void {
    const upgradeCode = args.creep.upgradeController(args.controller);
    if (upgradeCode == ERR_NOT_IN_RANGE) {
      args.creep.moveTo(args.controller, { range: 3 });
    }
  },
};
