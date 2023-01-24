import {Headquarters} from "./headquarters";
import {VisualWindow} from "./visuals/visual_window";

interface IGlobal {
  hq?: Headquarters;
  visualWindow: VisualWindow;
}

declare global {

  interface Memory {
  }

}