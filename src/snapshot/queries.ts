import { Pos, RoomSnapshot, StructureSnapshot } from "./types";

/**
 * Chebyshev distance between two positions (the number of moves ignoring terrain), matching
 * `RoomPosition.getRangeTo`. Positions in different rooms are infinitely far apart.
 */
export function getRange(a: Pos, b: Pos): number {
    if (a.roomName !== b.roomName) {
        return Infinity;
    }
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function isInRange(a: Pos, b: Pos, range: number): boolean {
    return getRange(a, b) <= range;
}

/** Returns the item closest to `origin` by range, or null if there are none in the same room. Ties keep the first. */
export function findClosestByRange<T extends { readonly pos: Pos }>(origin: Pos, items: readonly T[]): T | null {
    let closest: T | null = null;
    let closestRange = Infinity;
    for (const item of items) {
        const range = getRange(origin, item.pos);
        if (range < closestRange) {
            closest = item;
            closestRange = range;
        }
    }
    return closest;
}

/** Returns my structures of the given type. */
export function getMyStructures(room: RoomSnapshot, structureType: StructureConstant): StructureSnapshot[] {
    return room.structures.filter(s => s.structureType === structureType && s.owner === 'me');
}
