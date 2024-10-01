import { BaseCreepActions } from "base/base_creep_actions";

export const harvestNearestSource = function(creep: Creep, creepBaseActions: BaseCreepActions) {
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

}
