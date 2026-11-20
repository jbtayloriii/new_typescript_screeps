import { buildRoomSnapshot, toMyCreepSnapshot } from "./build_snapshot";
import { MyCreepSnapshot, RoomSnapshot } from "./types";

/**
 * Everything decision logic can see this tick, across all rooms.
 *
 * Room snapshots describe places and are built on first request (and then cached for the
 * tick), so only rooms that some decision actually reads cost anything. Creeps are listed
 * separately from rooms because ownership (`memory.baseRoomName` / `memory.taskName`) is
 * independent of where a creep currently is.
 */
export interface WorldSnapshot {
    readonly tick: number;
    /** Returns the room's snapshot, or undefined if the room isn't visible this tick. */
    getRoom(roomName: RoomName): RoomSnapshot | undefined;
    /** All of my creeps, in every room, including ones still spawning. */
    readonly myCreeps: readonly MyCreepSnapshot[];
}

export function createWorldSnapshot(game: Game = Game): WorldSnapshot {
    const roomCache = new Map<RoomName, RoomSnapshot | undefined>();
    return {
        tick: game.time,
        getRoom(roomName: RoomName) {
            if (!roomCache.has(roomName)) {
                const room = game.rooms[roomName];
                roomCache.set(roomName, room ? buildRoomSnapshot(room, game.time) : undefined);
            }
            return roomCache.get(roomName);
        },
        myCreeps: Object.values(game.creeps).map(toMyCreepSnapshot),
    };
}
