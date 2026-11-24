import { VisualName } from "./types";

/** Visuals cost CPU while on, so they switch off by themselves after this many ticks. */
export const VISUALS_DURATION = 200;

/** The panels and overlays to draw in a room this tick, or null if visuals are off (or expired) there. */
export function activePanels(memory: Memory, roomName: RoomName, tick: number): readonly VisualName[] | null {
    const settings = memory.visuals?.[roomName];
    return settings && tick < settings.until ? settings.panels : null;
}

/** Deletes expired visual settings. Returns the rooms switched off. */
export function pruneVisuals(memory: Memory, tick: number): RoomName[] {
    const expired: RoomName[] = [];
    for (const [roomName, settings] of Object.entries(memory.visuals ?? {})) {
        if (tick >= settings.until) {
            delete memory.visuals[roomName];
            expired.push(roomName);
        }
    }
    return expired;
}
