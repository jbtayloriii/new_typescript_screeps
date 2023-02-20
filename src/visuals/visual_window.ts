import { RhsPaneWindow } from "visuals/impl/rhs_pane_window";

export class VisualWindow {

  constructor() {

  }

  public static getVisualWindow(): VisualWindow {
    return new VisualWindow();
  }

  public reload(room: Room): void {
    let rhsWindow: RhsPaneWindow = new RhsPaneWindow();
    rhsWindow.draw(room);
  }
}