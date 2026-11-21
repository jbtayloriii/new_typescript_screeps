/**
 * What we know about a room, saved in `Memory.intel[roomName]` so decisions can use it without
 * vision. Kept small and JSON-safe; written by `recordIntel` whenever the room is visible.
 */
export interface RoomIntel {
    /** Tick this entry was last updated from a visible room. */
    readonly lastSeen: number;
    readonly sources: readonly { readonly id: Id<Source>; readonly x: number; readonly y: number }[];
    readonly controller?: {
        readonly x: number;
        readonly y: number;
        readonly level: number;
        readonly owner?: string;
        readonly reservedBy?: string;
        /** Tick the reservation ends. */
        readonly reservationEnd?: number;
    };
    readonly keeperLairs: number;
    /** Hostile creeps with attack or ranged attack parts seen at `lastSeen`. */
    readonly hostileCombatCreeps: number;
    /** Last tick hostile combat creeps were seen here (kept across updates without hostiles). */
    readonly hostilesLastSeen?: number;
}

export type IntelMap = { readonly [roomName: string]: RoomIntel };
