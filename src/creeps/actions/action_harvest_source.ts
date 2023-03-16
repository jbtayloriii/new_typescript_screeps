import { CreepAction } from "./creep_action";

export const ActionHarvestSource: CreepAction<{ creep: Creep }> = {
  shouldSwitch: function (args: { creep: Creep }) {
    if (args.creep.store[RESOURCE_ENERGY] == args.creep.store.getCapacity()) {
      return true;
    }
    return false;
  },

  performAction: function (args: { creep: Creep }): void {
    if (!args.creep.memory.harvestingSourceId) {
      const sources = args.creep.room.find(FIND_SOURCES);
      args.creep.memory.harvestingSourceId = sources[0].id;
    }

    const source = Game.getObjectById(args.creep.memory.harvestingSourceId);
    if (!source) {
      return;
    }

    const harvestCode = args.creep.harvest(source);
    if (harvestCode == ERR_NOT_IN_RANGE) {
      args.creep.moveTo(source, {
        visualizePathStyle: {
          fill: "transparent",
          stroke: "#fff",
          lineStyle: "dashed",
          strokeWidth: 0.15,
          opacity: 0.1,
        },
        range: 1,
      });
      // args.creep.FindAndMoveOnPath(source.pos, 1);
    }
  },
};
