import {ErrorMapper} from "./third_party/error_mapper";
import {Headquarters} from "./headquarters";
import { IGlobal } from "./global_types.d";
import {VisualWindow} from "./visuals/visual_window";

var global: IGlobal = {
  visualWindow: VisualWindow.getVisualWindow()
};

export const loop = ErrorMapper.wrapLoop(() => {
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }
  
  if (!global.hq) {
    console.log('Initializing HQ!!');
    const headquarters: Headquarters = Headquarters.deserialize();
    global.hq = headquarters;
  }

  global.visualWindow.reload();
});