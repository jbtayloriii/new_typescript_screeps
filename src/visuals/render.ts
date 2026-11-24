import { DrawCommand } from "./types";

/** The only visuals code that touches the game API: draws commands on a room's visual. */
export function renderCommands(commands: readonly DrawCommand[], visual: RoomVisual): void {
    for (const command of commands) {
        switch (command.kind) {
            case 'rect':
                visual.rect(command.x, command.y, command.width, command.height, { fill: command.fill, opacity: command.opacity });
                break;
            case 'text':
                visual.text(command.text, command.x, command.y, {
                    color: command.color,
                    font: `${command.size} monospace`,
                    align: 'left',
                });
                break;
            case 'glyph':
                // Text sits on its baseline, so drop it a little to center it on the tile.
                visual.text(command.text, command.x, command.y + command.size * 0.35, {
                    color: command.color,
                    font: command.size,
                    align: 'center',
                    opacity: command.opacity,
                });
                break;
        }
    }
}
