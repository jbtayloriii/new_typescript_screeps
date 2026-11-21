import { MyCreepSnapshot, RoomSnapshot } from "snapshot/types";
import { WorldSnapshot } from "snapshot/world";

export interface WorldOptions {
    /** Defaults to every creep present in the given rooms. */
    readonly myCreeps?: readonly MyCreepSnapshot[];
    /** Exits by room name. Rooms not listed have none. */
    readonly exits?: Readonly<Record<RoomName, readonly RoomName[]>>;
    readonly myUsername?: string;
}

/** A WorldSnapshot made of the given (visible) rooms. */
export function worldOf(rooms: readonly RoomSnapshot[], opts: WorldOptions = {}): WorldSnapshot {
    const byName = new Map(rooms.map(r => [r.name, r]));
    return {
        tick: rooms[0]?.tick ?? 1,
        myUsername: opts.myUsername ?? 'me',
        visibleRooms: rooms.map(r => r.name),
        getRoom: (name) => byName.get(name),
        getExits: (name) => opts.exits?.[name] ?? [],
        myCreeps: opts.myCreeps ?? rooms.flatMap(r => r.creepsPresent),
    };
}
