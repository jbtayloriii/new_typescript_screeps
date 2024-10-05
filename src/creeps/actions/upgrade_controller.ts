/** Action for a creep attempting to upgrade a controller.
 * 
 * If the creep is not in range then it will attempt to move first. 
 */
export const upgradeController = function(creep: Creep, controller: StructureController) {
  const upgradeCode = creep.upgradeController(controller);
  if (upgradeCode == ERR_NOT_IN_RANGE) {
    creep.moveTo(controller, { range: 3 });
  }
};
