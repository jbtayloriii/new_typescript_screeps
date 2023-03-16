
const repairCutoff = 10000;

StructureTower.prototype.repairStructures = function (this: StructureTower) {
  const room = this.room;

  const structure = this.pos.findClosestByPath(FIND_STRUCTURES, {
    filter: (structure) =>
      structure.hits <= structure.hitsMax - 1000 &&
      structure.hits <= repairCutoff,
  });

  if (structure) {
    const repairCode = this.repair(structure);
  }
};

StructureTower.prototype.attackEnemy = function(this: StructureTower): boolean {
  var closestHostile = this.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
  if(closestHostile) {
      this.attack(closestHostile);
      return true;
  }
  return false;
}
