
/** Action for a creep attempting to build at the nearest construction site. */
export const buildStructure = function(creep: Creep) {
  if (!creep.memory.buildingConstructionSiteId) {
    const site = creep.pos.findClosestByPath(FIND_MY_CONSTRUCTION_SITES);
    if (!site) {
      return;
    }

    creep.memory.buildingConstructionSiteId = site?.id;
  }
  const buildSite = Game.getObjectById(
    creep.memory.buildingConstructionSiteId
  );
  if (!buildSite) {
    delete creep.memory.buildingConstructionSiteId;
    return;
  }

  const buildCode = creep.build(buildSite);
  if (buildCode == ERR_NOT_IN_RANGE) {
    creep.moveTo(buildSite, { range: 1 });
  }
}
