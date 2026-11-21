const ROOM_NAME = /^([WE])(\d+)([NS])(\d+)$/;

export function isValidRoomName(name: string): boolean {
    return ROOM_NAME.test(name);
}

/** World coordinates of a room: E0 → x 0, W0 → x -1; S0 → y 0, N0 → y -1. */
export function roomCoords(name: RoomName): { x: number, y: number } | null {
    const match = ROOM_NAME.exec(name);
    if (!match) {
        return null;
    }
    const [, we, x, ns, y] = match;
    return {
        x: we === 'E' ? Number(x) : -Number(x) - 1,
        y: ns === 'S' ? Number(y) : -Number(y) - 1,
    };
}

/**
 * Rooms between two rooms in a straight line (like `Game.map.getRoomLinearDistance`, without
 * world wrap-around). Infinity for invalid names.
 */
export function roomLinearDistance(a: RoomName, b: RoomName): number {
    const ca = roomCoords(a);
    const cb = roomCoords(b);
    if (!ca || !cb) {
        return Infinity;
    }
    return Math.max(Math.abs(ca.x - cb.x), Math.abs(ca.y - cb.y));
}
