import { Logger } from "logging/logger";

type StorableStructure = STRUCTURE_SPAWN | STRUCTURE_EXTENSION | STRUCTURE_STORAGE;

/**
 * Finds (if necessary) and attempts to store energy from a creep onto a structure.
 * @param creep The creep to act.
 * @param priorityList An optional list of target priorities to choose when picking a new structure
 */
export function returnEnergyToStructure(creep: Creep, priorityList: StorableStructure[] = []) {
  // Clear the current structure if it's invalid
  if (creep.memory.currentStructureResourceTargetId) {
    let targetObj = Game.getObjectById(creep.memory.currentStructureResourceTargetId);
    if (targetObj == null
        || !("store" in targetObj)
        || (targetObj.store as Store<RESOURCE_ENERGY, false>).getFreeCapacity(RESOURCE_ENERGY) == 0
    ) {
      delete creep.memory.currentStructureResourceTargetId;
    }
  }

  // If creep doesn't have a target, find one
  creep.memory.currentStructureResourceTargetId = findNewTarget(creep, priorityList);
  if (!creep.memory.currentStructureResourceTargetId) {
    Logger.warning(`Could not find structure to return energy to for creep ${creep.name}`)
    return;
  }

  let structure = Game.getObjectById(creep.memory.currentStructureResourceTargetId);
  if (!structure) {
    Logger.warning(`Could not find structure with ID ${creep.memory.currentStructureResourceTargetId}`);
    delete creep.memory.currentStructureResourceTargetId;
    return;
  }

  // Attempt to store energy
  let transferCode = creep.transfer(structure, RESOURCE_ENERGY);

  if(transferCode == ERR_NOT_IN_RANGE) {
    creep.moveTo(structure);
    return;
  } else if(transferCode == OK) {
      if(creep.store.energy > 0) {
          return;
      } else {
          delete creep.memory.currentStructureResourceTargetId;
          return;
      }
  } else if(transferCode == ERR_NOT_ENOUGH_ENERGY) {
      delete creep.memory.currentStructureResourceTargetId;
      return;
  }
}

function findNewTarget(creep: Creep, priorityList: StorableStructure[]) {

    
  let closestTarget;
    
  if(priorityList.length == 0) {
    closestTarget = creep.pos.findClosestByRange(FIND_STRUCTURES, {
      filter: (structure) => {
        return (structure.structureType == STRUCTURE_EXTENSION ||
          structure.structureType == STRUCTURE_TOWER ||
          structure.structureType == STRUCTURE_SPAWN ||
          structure.structureType == STRUCTURE_CONTAINER ||
          structure.structureType == STRUCTURE_STORAGE) && structure.store.energy < structure.store.getCapacity(RESOURCE_ENERGY);
      }
    });
  } else {
    for(let i = 0; (i < priorityList.length) && (!closestTarget); i++) {
      closestTarget = creep.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: (structure) => {
          return (structure.structureType == priorityList[i]) && structure.store.energy < structure.store.getCapacity(RESOURCE_ENERGY);
        }
      });
    }
  }
  if(closestTarget) {
    return closestTarget.id;
  } else {
      return undefined;
  }
}
