import { MyCreepSnapshot, RoomSnapshot } from "snapshot/types";
import { WorldSnapshot } from "snapshot/world";

/**
 * A WorldSnapshot made of the given rooms. Unless `myCreeps` is given, it's every creep
 * present in those rooms.
 */
export function worldOf(rooms: readonly RoomSnapshot[], myCreeps?: readonly MyCreepSnapshot[]): WorldSnapshot {
    const byName = new Map(rooms.map(r => [r.name, r]));
    return {
        tick: rooms[0]?.tick ?? 1,
        getRoom: (name) => byName.get(name),
        myCreeps: myCreeps ?? rooms.flatMap(r => r.creepsPresent),
    };
}
