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
    /** My player name, or undefined before I own anything. */
    readonly myUsername: string | undefined;
    /** Names of all rooms visible this tick. */
    readonly visibleRooms: readonly RoomName[];
    /** Returns the room's snapshot, or undefined if the room isn't visible this tick. */
    getRoom(roomName: RoomName): RoomSnapshot | undefined;
    /** Rooms connected to this one by an exit. Works without vision. */
    getExits(roomName: RoomName): readonly RoomName[];
    /** All of my creeps, in every room, including ones still spawning. */
    readonly myCreeps: readonly MyCreepSnapshot[];
}

export function createWorldSnapshot(game: Game = Game): WorldSnapshot {
    const roomCache = new Map<RoomName, RoomSnapshot | undefined>();
    const exitCache = new Map<RoomName, readonly RoomName[]>();
    return {
        tick: game.time,
        myUsername: Object.values(game.spawns)[0]?.owner.username,
        visibleRooms: Object.keys(game.rooms),
        getRoom(roomName: RoomName) {
            if (!roomCache.has(roomName)) {
                const room = game.rooms[roomName];
                roomCache.set(roomName, room ? buildRoomSnapshot(room, game.time) : undefined);
            }
            return roomCache.get(roomName);
        },
        getExits(roomName: RoomName) {
            if (!exitCache.has(roomName)) {
                const exits = game.map.describeExits(roomName);
                exitCache.set(roomName, exits ? Object.values(exits) as RoomName[] : []);
            }
            return exitCache.get(roomName)!;
        },
        myCreeps: Object.values(game.creeps).map(toMyCreepSnapshot),
    };
}
