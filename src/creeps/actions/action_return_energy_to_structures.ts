import { CreepAction } from "./creep_action";

type StorageStructure = StructureSpawn;

export const ReturnEnergyToStructures: CreepAction<{
  creep: Creep;
  structures: StorageStructure[];
}> = {
  shouldSwitch: function (args: {
    creep: Creep;
    structures: StorageStructure[];
  }): boolean {
    if (args.creep.store[RESOURCE_ENERGY] == 0) {
      return true;
    }
    return false;
  },

  performAction: function (args: {
    creep: Creep;
    structures: StorageStructure[];
  }): void {
    if (shouldSwapStructure(args.creep)) {
      const needyStructures = args.structures.filter(
        (st) => st.store.getFreeCapacity(RESOURCE_ENERGY) > 0
      );
      if (needyStructures.length == 0) {
        return;
      }
      args.creep.memory.currentStructureResourceTargetId =
        needyStructures[0].id;
    }

    const nextStructure = Game.getObjectById(
      args.creep.memory.currentStructureResourceTargetId!
    );
    if (!nextStructure) {
      return;
    }

    const transferCode = args.creep.transfer(nextStructure, RESOURCE_ENERGY);
    if (transferCode == ERR_NOT_IN_RANGE) {
      args.creep.moveTo(nextStructure, {
        range: 1,
        visualizePathStyle: {
          fill: "transparent",
          stroke: "#fff",
          lineStyle: "dashed",
          strokeWidth: 0.15,
          opacity: 0.1,
        },
      });
    }
  },
};

function shouldSwapStructure(creep: Creep): boolean {
  if (!creep.memory.currentStructureResourceTargetId) {
    return true;
  }
  const struc = Game.getObjectById(
    creep.memory.currentStructureResourceTargetId
  );
  if (!struc) {
    return true;
  }
  if (
    !("store" in struc) ||
    (struc.store as Store<RESOURCE_ENERGY, false>).getFreeCapacity(
      RESOURCE_ENERGY
    ) == 0
  ) {
    return true;
  }

  return false;
}
