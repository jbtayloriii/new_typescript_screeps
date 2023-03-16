// Room.prototype.getSourcesAndOpenSpots = function (this: Room) {
//   const memory = this.memory;
//   if (!memory._sourceToHarvestSpotMap) {
//     memory._sourceToHarvestSpotMap = mapRoomSourcesToHarvestSpots(this);
//   }

//   return Object.entries(memory._sourceToHarvestSpotMap);
// };

Room.prototype.addCreepToSource = function (
  this: Room,
  creep: Creep,
  source: Source
): boolean {
  const memory = this.memory;
  if (!memory._sourceToHarvestSpotMap) {
    memory._sourceToHarvestSpotMap = mapRoomSourcesToHarvestSpots(this);
  }

  if (!memory._sourceToHarvestSpotMap.has(source.id)) {
    return false;
  }

  const harvestData = memory._sourceToHarvestSpotMap.get(source.id);
  if (harvestData!.openSpots == harvestData!.currentCreeps.length) {
    return false;
  }

  harvestData!.currentCreeps.push(creep.id);
  return true;
};

Room.prototype.removeCreepFromSource = function (
  this: Room,
  creep: Creep,
  source: Source
) {
  const memory = this.memory;
  if (!memory._sourceToHarvestSpotMap) {
    return false;
  }

  if (!memory._sourceToHarvestSpotMap.has(source.id)) {
    return false;
  }

  let creepList = memory._sourceToHarvestSpotMap.get(source.id)?.currentCreeps;
  const index = creepList!.indexOf(creep.id);
  if (index >= 0) {
    creepList?.splice(index, 1);
    return true;
  }
  return false;
};

function mapRoomSourcesToHarvestSpots(room: Room) {
  let sourceMap = new Map<Id<Source>, any>();
  for (let source of room.find(FIND_SOURCES)) {
    const openHarvestSpots = source.pos.getWalkableNearbySpots().length;
    sourceMap.set(source.id, {
      openSpots: openHarvestSpots,
      currentCreeps: [],
    });
  }
  return sourceMap;
}
