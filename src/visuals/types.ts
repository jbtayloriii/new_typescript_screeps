/** The HUD's panels. See docs/VISUALS.md. */
export type PanelName = 'header' | 'tasks' | 'spawn' | 'economy';

export const ALL_PANELS: readonly PanelName[] = ['header', 'tasks', 'spawn', 'economy'];
export const DEFAULT_PANELS: readonly PanelName[] = ['header', 'tasks', 'spawn', 'economy'];

/** Text colors, kept few so the HUD reads at a glance. */
export const COLORS = {
    title: '#ffd166',
    text: '#e6e6e6',
    dim: '#9a9a9a',
    good: '#81c784',
    warn: '#ffb74d',
    bad: '#e57373',
    background: '#101418',
    barEmpty: '#2a3036',
} as const;

export type Color = typeof COLORS[keyof typeof COLORS];

/** One line of a panel: text, optionally followed by a bar filling the rest of the line. */
export interface Row {
    readonly text: string;
    readonly color?: Color;
    readonly bar?: { readonly fraction: number; readonly color: Color };
}

export interface Panel {
    readonly title: string;
    readonly rows: readonly Row[];
}

/** Plain drawing instructions, so layout can be tested without `RoomVisual`. */
export type DrawCommand =
    | { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly fill: string; readonly opacity: number }
    | { readonly kind: 'text'; readonly text: string; readonly x: number; readonly y: number; readonly color: string; readonly size: number };

/** Saved per room in `Memory.visuals`: which panels to draw, until which tick. */
export interface VisualSettings {
    readonly panels: readonly PanelName[];
    readonly until: number;
}
