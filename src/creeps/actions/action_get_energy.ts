import { BaseCreepActions } from "base/base_creep_actions";

export const ActionGetEnergy = function(creep: Creep, creepBaseActions: BaseCreepActions) {
  let energySources = creepBaseActions.energySources;

  // First priority: Pull from storage
  if (energySources.storage) {
    let withdrawCode = creep.withdraw(energySources.storage, RESOURCE_ENERGY);
    if (withdrawCode == ERR_NOT_IN_RANGE) {
      creep.moveTo(energySources.storage);
    }
    return;
  }

  // Second priority: Pull from (power harvesting) containers
  if (energySources.containers) {
    
    let closestContainer = creep.pos.findClosestByPath(energySources.containers) as StructureContainer;
    let withdrawCode = creep.withdraw(closestContainer, RESOURCE_ENERGY);
    if (withdrawCode == ERR_NOT_IN_RANGE) {
      creep.moveTo(closestContainer);
    }
    return;
  }

  // Third priorty: Manually harvest from sources
  if (!creep.memory.harvestingSourceId) {
    const source = creep.pos.findClosestByPath(FIND_SOURCES);
    if (!source) {
      console.log(`Unable to find source for ${creep.name}`);
      return;
    }
    creep.memory.harvestingSourceId = source.id;
  }

  const source = Game.getObjectById(creep.memory.harvestingSourceId);
  if (!source) {
    return;
  }

  const harvestCode = creep.harvest(source);
  if (harvestCode == ERR_NOT_IN_RANGE) {
    console.log("Moving to source");
    creep.moveTo(source, {
      visualizePathStyle: {
        fill: "transparent",
        stroke: "#fff",
        lineStyle: "dashed",
        strokeWidth: 0.15,
        opacity: 0.1,
      },
      range: 1,
    });
  }
};
