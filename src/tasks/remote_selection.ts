import { IntelMap, RoomIntel } from "intel/types";

/** Energy capacity needed to run 1 remote room (and 2 at the higher threshold). */
export const REMOTE_MIN_CAPACITY = 800;
export const SECOND_REMOTE_MIN_CAPACITY = 1300;

/** Rooms where hostile combat creeps were seen this recently aren't picked as new remotes. */
export const REMOTE_HOSTILE_AVOID_TICKS = 1500;

export function maxRemoteRooms(energyCapacity: number): number {
    if (energyCapacity >= SECOND_REMOTE_MIN_CAPACITY) return 2;
    if (energyCapacity >= REMOTE_MIN_CAPACITY) return 1;
    return 0;
}

/** Why a room can't be (or stop being) one of my remotes, or null if it can. */
export function remoteBlocker(intel: RoomIntel | undefined, myUsername: string | undefined): string | null {
    if (!intel) return 'no intel';
    if (intel.sources.length === 0) return 'no sources';
    if (intel.keeperLairs > 0) return 'source keepers';
    if (!intel.controller) return 'no controller';
    if (intel.controller.owner) return 'owned';
    if (intel.controller.reservedBy && intel.controller.reservedBy !== myUsername) return 'reserved by another player';
    return null;
}

export interface RemoteChoiceInput {
    readonly energyCapacity: number;
    /** Rooms adjacent to the base. */
    readonly neighbors: readonly RoomName[];
    readonly intel: IntelMap;
    readonly myUsername: string | undefined;
    readonly tick: number;
    /** This base's current remote rooms. */
    readonly current: readonly RoomName[];
    /** Rooms used by other bases (as bases or remotes), which this base must not take. */
    readonly unavailable: readonly RoomName[];
}

/**
 * Picks new remote rooms for a base, up to its limit: adjacent rooms that are unowned, not
 * reserved by another player, without source keepers, and without recent hostiles. More sources
 * first, then by name for stability.
 */
export function chooseNewRemoteRooms(input: RemoteChoiceInput): RoomName[] {
    const slots = maxRemoteRooms(input.energyCapacity) - input.current.length;
    if (slots <= 0) {
        return [];
    }
    return input.neighbors
        .filter(room => !input.current.includes(room) && !input.unavailable.includes(room))
        .filter(room => remoteBlocker(input.intel[room], input.myUsername) === null)
        .filter(room => {
            const seen = input.intel[room].hostilesLastSeen;
            return seen === undefined || input.tick - seen >= REMOTE_HOSTILE_AVOID_TICKS;
        })
        .sort((a, b) => input.intel[b].sources.length - input.intel[a].sources.length || a.localeCompare(b))
        .slice(0, slots);
}
