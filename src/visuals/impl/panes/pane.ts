
const TEXT_X_OFFSET = 0.5;
const HEADER_HEIGHT = 2;

export class Pane {
  header: string;
  x: number;
  y: number;
  width: number;
  height: number;

  constructor(header: string, x: number, y: number, width: number, height: number) {
    this.header = header;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  draw(rv: RoomVisual, text: string[]): void {
    rv.rect(this.x, this.y, this.width, this.height, { fill: 'GREEN' });
    
    // Header
    rv.rect(this.x, this.y, this.width, HEADER_HEIGHT, {fill: 'GREEN', opacity: 0.8});
    rv.text(this.header, this.x + TEXT_X_OFFSET, this.y + 1.5, {font: "1.1 monospace", align: "left"})


    // Draw main text
    let yOffset: number = HEADER_HEIGHT + 1;
    for (let line of text) {
      rv.text(line, this.x + TEXT_X_OFFSET, this.y + yOffset, {font: "0.8 monospace", align: "left"});
      yOffset += 1;
    }
  }
}