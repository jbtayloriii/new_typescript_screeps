import { VISUALS_DURATION } from "./settings";
import { ALL_OVERLAYS, ALL_PANELS, DEFAULT_PANELS, VisualName } from "./types";

export type VisualsMode = 'on' | 'off' | 'all' | readonly VisualName[];

/**
 * `cmd.visuals(...)`: turns a room's HUD on or off. Each "on" lasts VISUALS_DURATION ticks.
 *
 *   cmd.visuals()                        list rooms with visuals on
 *   cmd.visuals('W1N1')                  toggle the default panels
 *   cmd.visuals('W1N1', 'off')
 *   cmd.visuals('W1N1', 'all')
 *   cmd.visuals('W1N1', ['tasks', 'spawn'])
 *   cmd.visuals('W1N1', ['layout'])     overlays (see cmd.layout) are only on when named
 */
export function createVisualsCommand(getMemory: () => Memory, getTick: () => number) {
    return function visuals(roomName?: RoomName, mode?: VisualsMode): string {
        const memory = getMemory();
        const tick = getTick();
        memory.visuals ??= {};

        if (roomName === undefined) {
            const on = Object.entries(memory.visuals).filter(([, s]) => tick < s.until);
            return on.length === 0
                ? 'Visuals are off everywhere.'
                : on.map(([room, s]) => `${room}: ${s.panels.join(', ')} (${s.until - tick} ticks left)`).join('\n');
        }
        if (!memory.bases_v3[roomName]) {
            return `Not a base: ${roomName}`;
        }

        const current = memory.visuals[roomName];
        const isOn = current !== undefined && tick < current.until;
        if (mode === 'off' || (mode === undefined && isOn)) {
            delete memory.visuals[roomName];
            return `Visuals off in ${roomName}.`;
        }

        let panels: readonly VisualName[];
        if (mode === 'all') {
            panels = ALL_PANELS;
        } else if (Array.isArray(mode)) {
            const known: readonly string[] = [...ALL_PANELS, ...ALL_OVERLAYS];
            const unknown = mode.filter(p => !known.includes(p));
            if (unknown.length > 0) {
                return `Unknown panels: ${unknown.join(', ')}. Panels: ${ALL_PANELS.join(', ')}. Overlays: ${ALL_OVERLAYS.join(', ')}.`;
            }
            panels = mode;
        } else {
            panels = DEFAULT_PANELS;
        }
        memory.visuals[roomName] = { panels: [...panels], until: tick + VISUALS_DURATION };
        return `Visuals on in ${roomName} for ${VISUALS_DURATION} ticks: ${panels.join(', ')}.`;
    };
}
