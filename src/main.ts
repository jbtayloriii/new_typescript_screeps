import { ErrorMapper } from "./third_party/error_mapper";
import { Headquarters } from "./headquarters";
import { IGlobal } from "./global_types.d";
import { VisualWindow } from "./visuals/visual_window";
import { MemoryUtil } from "./memory_util";

var global: IGlobal = {
  visualWindow: VisualWindow.getVisualWindow()
};

export const loop = ErrorMapper.wrapLoop(() => {
  console.log("Tick " + Game.time);

  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }

  if (MemoryUtil.shouldInitializeMemory()) {
    MemoryUtil.initializeMemory();
  }

  if (!global.hq) {
    console.log('Initializing HQ!!');
    global.hq = Headquarters.deserialize(Memory.bases);
  }

  global.hq.checkWorld();
  global.hq.processResourceRequests();
  global.hq.run();

  global.hq.serialize();

  // Test code for visuals
  // let room: Room = Object.values(Game.rooms)[0];

  // global.visualWindow.reload(room);
});