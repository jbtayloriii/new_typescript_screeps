import { BaseLayoutMap } from "global_types";
import { basePlanCoordToSymbolObj, basePlanCoordToBuildingObj } from "utils/string_utils";
import { COLORS, DrawCommand } from "./types";

/** One color per RCL (index 1–8), so the overlay shows when each structure unlocks. */
export const LEVEL_COLORS = ['', '#ffffff', '#81c784', '#4fc3f7', '#9575cd', '#f06292', '#ffb74d', '#e57373', '#ffd54f'] as const;

/** Opacity of planned structures that are already built (or have a site), and of unbuilt ones. */
const BUILT_OPACITY = 0.2;
const UNBUILT_OPACITY = 0.85;

/**
 * The layout preview overlay: every planned structure as its layout symbol (x extension,
 * t tower, s spawn, …; roads as dots), colored by the RCL that unlocks it, and faded once built.
 * Ramparts are drawn as a box (□) around the structure they cover. `built` holds
 * "x_y_structureType" for every structure and construction site in the room. Warnings are listed at the bottom left, above an RCL color legend.
 */
export function layoutOverlay(layout: BaseLayoutMap, built: ReadonlySet<string>, warnings: readonly string[] = []): DrawCommand[] {
    const commands: DrawCommand[] = [];
    for (const [levelKey, coords] of Object.entries(layout)) {
        const level = Number(levelKey);
        for (const coordString of coords) {
            const { coord, symbol } = basePlanCoordToSymbolObj(coordString);
            const { structure } = basePlanCoordToBuildingObj(coordString);
            const isRoad = structure === STRUCTURE_ROAD;
            // Ramparts are usually over another structure, so they're a box around its symbol.
            const isRampart = structure === STRUCTURE_RAMPART;
            commands.push({
                kind: 'glyph',
                text: isRoad ? '·' : isRampart ? '□' : symbol,
                x: coord.x,
                y: coord.y,
                color: LEVEL_COLORS[level] ?? COLORS.text,
                size: isRoad ? 0.6 : isRampart ? 1 : 0.5,
                opacity: built.has(`${coord.x}_${coord.y}_${structure}`) ? BUILT_OPACITY : UNBUILT_OPACITY,
            });
        }
    }

    const legendY = 49.2;
    commands.push({ kind: 'text', text: 'Layout RCL', x: 0.5, y: legendY, color: COLORS.dim, size: 0.5 });
    for (let level = 1; level <= 8; level++) {
        commands.push({ kind: 'text', text: String(level), x: 3.8 + level * 0.6, y: legendY, color: LEVEL_COLORS[level], size: 0.5 });
    }
    warnings.forEach((warning, i) => {
        commands.push({ kind: 'text', text: `⚠ ${warning}`, x: 0.5, y: legendY - 0.7 * (warnings.length - i), color: COLORS.warn, size: 0.5 });
    });
    return commands;
}

/**
 * A console summary of a base's layout: what each RCL adds (planned and how many are built),
 * then the planner's warnings.
 */
export function summarizeLayout(roomName: RoomName, base: Readonly<BaseMemory>, built?: ReadonlySet<string>): string {
    const lines = [`${roomName} layout v${base.layoutVersion ?? 1}${built ? ' (built/planned)' : ''}:`];
    for (let level = 1; level <= 8; level++) {
        const counts = new Map<string, { planned: number, built: number }>();
        for (const coordString of base.baseLayout[level] ?? []) {
            const { coord, structure } = basePlanCoordToBuildingObj(coordString);
            const entry = counts.get(structure) ?? { planned: 0, built: 0 };
            entry.planned++;
            if (built?.has(`${coord.x}_${coord.y}_${structure}`)) entry.built++;
            counts.set(structure, entry);
        }
        const parts = [...counts].map(([structure, c]) => built ? `${structure} ${c.built}/${c.planned}` : `${structure} ${c.planned}`);
        lines.push(`  RCL ${level}: ${parts.length > 0 ? parts.join(', ') : '-'}`);
    }
    const warnings = base.layoutWarnings ?? [];
    lines.push(warnings.length > 0 ? `Warnings:\n${warnings.map(w => `  ${w}`).join('\n')}` : 'No warnings.');
    return lines.join('\n');
}
