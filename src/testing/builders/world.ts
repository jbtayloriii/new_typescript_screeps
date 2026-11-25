import { MyCreepSnapshot, RoomSnapshot } from "snapshot/types";
import { FlagSnapshot, TerrainView, WorldSnapshot } from "snapshot/world";

export interface WorldOptions {
    /** Defaults to every creep present in the given rooms. */
    readonly myCreeps?: readonly MyCreepSnapshot[];
    /** Exits by room name. Rooms not listed have none. */
    readonly exits?: Readonly<Record<RoomName, readonly RoomName[]>>;
    readonly myUsername?: string;
    readonly flags?: readonly FlagSnapshot[];
    readonly gclLevel?: number;
    /** Defaults to the given rooms whose controller is mine. */
    readonly ownedRooms?: readonly RoomName[];
    /** Walls by room name, as "x_y" strings. */
    readonly walls?: Readonly<Record<RoomName, ReadonlySet<string>>>;
    /** Swamps by room name, as "x_y" strings. */
    readonly swamps?: Readonly<Record<RoomName, ReadonlySet<string>>>;
    /** Room statuses; rooms not listed are 'normal'. */
    readonly roomStatus?: Readonly<Record<RoomName, string>>;
    /** Routes by "from>to"; unlisted pairs route straight to `to`. Null means no route. */
    readonly routes?: Readonly<Record<string, readonly RoomName[] | null>>;
    /** Terrain views by room name, overriding walls/swamps. */
    readonly terrain?: Readonly<Record<RoomName, TerrainView>>;
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
        flags: opts.flags ?? [],
        gclLevel: opts.gclLevel ?? 1,
        ownedRooms: opts.ownedRooms ?? rooms.filter(r => r.controller?.my).map(r => r.name),
        getTerrain: (name) => opts.terrain?.[name] ?? {
            isWall: (x, y) => opts.walls?.[name]?.has(`${x}_${y}`) ?? false,
            isSwamp: (x, y) => opts.swamps?.[name]?.has(`${x}_${y}`) ?? false,
        },
        getRoomStatus: (name) => opts.roomStatus?.[name] ?? 'normal',
        findRoute: (from, to, avoid) => {
            const key = `${from}>${to}`;
            const route = opts.routes && key in opts.routes ? opts.routes[key] : [to];
            return route && route.some(r => r !== to && avoid(r)) ? null : route ? [...route] : null;
        },
    };
}
