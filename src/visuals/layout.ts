import { COLORS, DrawCommand, Panel } from "./types";

/** HUD geometry, in room tiles. Text is monospace, so width is characters × CHAR_WIDTH. */
export const HUD = {
    x: 0.5,
    y: 0.5,
    /** Characters per line; longer rows are cut off with "…". */
    widthChars: 52,
    fontSize: 0.5,
    charWidth: 0.3,
    lineHeight: 0.7,
    padding: 0.3,
    /** Space between panels. */
    gap: 0.3,
    opacity: 0.75,
} as const;

/** Cuts text to fit a line, ending with "…" if it was cut. */
export function truncate(text: string, maxChars: number): string {
    return text.length <= maxChars ? text : text.slice(0, Math.max(0, maxChars - 1)) + '…';
}

/**
 * Stacks panels from the top-left corner: each gets a background, a title line and its rows.
 * A row's bar fills the rest of its line after the text.
 */
export function layoutHud(panels: readonly Panel[]): DrawCommand[] {
    const commands: DrawCommand[] = [];
    const width = HUD.widthChars * HUD.charWidth + 2 * HUD.padding;
    let y = HUD.y;

    for (const panel of panels) {
        const lines = 1 + panel.rows.length;
        const height = lines * HUD.lineHeight + 2 * HUD.padding;
        commands.push({ kind: 'rect', x: HUD.x, y, width, height, fill: COLORS.background, opacity: HUD.opacity });

        // Text is drawn on its baseline, so place it slightly below the middle of each line.
        const textY = (line: number) => y + HUD.padding + line * HUD.lineHeight + HUD.lineHeight * 0.75;
        const textX = HUD.x + HUD.padding;
        commands.push({ kind: 'text', text: truncate(panel.title, HUD.widthChars), x: textX, y: textY(0), color: COLORS.title, size: HUD.fontSize });

        panel.rows.forEach((row, i) => {
            const text = truncate(row.text, HUD.widthChars);
            commands.push({ kind: 'text', text, x: textX, y: textY(i + 1), color: row.color ?? COLORS.text, size: HUD.fontSize });
            if (row.bar) {
                const barX = textX + text.length * HUD.charWidth;
                const barWidth = Math.max(0, HUD.x + width - HUD.padding - barX);
                const barY = y + HUD.padding + (i + 1) * HUD.lineHeight + HUD.lineHeight * 0.2;
                const barHeight = HUD.lineHeight * 0.6;
                const fraction = Math.max(0, Math.min(1, row.bar.fraction));
                commands.push({ kind: 'rect', x: barX, y: barY, width: barWidth, height: barHeight, fill: COLORS.barEmpty, opacity: 1 });
                if (fraction > 0) {
                    commands.push({ kind: 'rect', x: barX, y: barY, width: barWidth * fraction, height: barHeight, fill: row.bar.color, opacity: 1 });
                }
            }
        });
        y += height + HUD.gap;
    }
    return commands;
}
