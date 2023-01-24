

export class VisualWindow {

  constructor() {

  }

  public static getVisualWindow(): VisualWindow {
    return new VisualWindow();
  }

  public reload(): void {
    console.log("Reloading visual window");
  }
}