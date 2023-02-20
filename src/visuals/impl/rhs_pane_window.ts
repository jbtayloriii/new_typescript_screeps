import { IVisualWindow } from "visuals/api/visual_window";
import { RhsPaneConstants, ExampleText } from "visuals/api/window_constants";
import { Pane } from "visuals/impl/panes/pane";

export class RhsPaneWindow implements IVisualWindow {

  rhsPane: Pane;

  constructor() {
    this.rhsPane = new Pane("example header", RhsPaneConstants.X, RhsPaneConstants.Y, RhsPaneConstants.WIDTH, RhsPaneConstants.HEIGHT);


  }

  draw(room: Room): void {
    let rv: RoomVisual = room.visual;

    this.rhsPane.draw(rv, ExampleText);

  }
}