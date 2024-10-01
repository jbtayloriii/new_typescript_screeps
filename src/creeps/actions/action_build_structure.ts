import { CreepAction } from "./creep_action";

export const ActionBuildStucture: CreepAction<{ creep: Creep }> = {
  shouldSwitch: function (args: { creep: Creep }): boolean {
    if (args.creep.store[RESOURCE_ENERGY] == args.creep.store.getCapacity()) {
      return true;
    }
    return false;
  },

  performAction: function (args: { creep: Creep }): void {
    if (!args.creep.memory.buildingConstructionSiteId) {
      const site = args.creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES);
      if (!site) {
        return;
      }

      args.creep.memory.buildingConstructionSiteId = site?.id;
    }
    const buildSite = Game.getObjectById(
      args.creep.memory.buildingConstructionSiteId
    );
    if (!buildSite) {
      delete args.creep.memory.buildingConstructionSiteId;
      return;
    }

    const buildCode = args.creep.build(buildSite);
    if (buildCode == ERR_NOT_IN_RANGE) {
      args.creep.moveTo(buildSite, { range: 1 });
    }
  },
};
