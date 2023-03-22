import { ErrorMapper } from "./third_party/error_mapper";
import { Headquarters } from "./headquarters";
import { MemoryUtil } from "./memory_util";

import "./prototypes/creep_prototype";
import "./prototypes/room_position_prototype";
import "./prototypes/room_prototype";
import "./prototypes/tower_prototype";

var globalHq = Headquarters.initialize();

export const loop = ErrorMapper.wrapLoop(() => {
  console.log("Tick " + Game.time);

  if (MemoryUtil.shouldInitializeMemory()) {
    MemoryUtil.initializeMemory();
  }

  globalHq.checkWorld();
  globalHq.processResourceRequests();
  globalHq.run();
  globalHq.cleanUp();

  // TODO: move into headquarters and bases
  for(let roomName in Game.rooms) {
    let towers = Game.rooms[roomName].find(FIND_MY_STRUCTURES, {
        filter: { structureType: STRUCTURE_TOWER }
    }) as StructureTower[];
    for(let i = 0; i < towers.length; i++) {
        const tower = towers[i];
        if(!tower.attackEnemy()) {
            tower.repairStructures();
        }
    }
}
  
  console.log("------------------------------");
  console.log("-");
});