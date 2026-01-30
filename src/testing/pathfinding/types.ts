import { MapPosition } from "./map_position";

export type TerrainPackedBits = Uint8Array;

export type TerrainData = {
    room: MapPosition,
    // bits: TerrainPackedBits,
    vals: number[][],
}

export type MockRoom = {
    room: string,
    terrain: number[][],
};

export type RoomPositionLike = {
    x: number,
    y: number,
    roomName: string,
}

export enum Direction {
    TOP = 1,
    TOP_RIGHT,
    RIGHT,
    BOTTOM_RIGHT,
    BOTTOM,
    BOTTOM_LEFT,
    LEFT,
    TOP_LEFT,
};

// TODO: Figure out a better way to iterate over all
// Direction values while keeping Direction type
export const AllDirections: Direction[] = [
    TOP,
    TOP_RIGHT,
    RIGHT,
    BOTTOM_RIGHT,
    BOTTOM,
    BOTTOM_LEFT,
    LEFT,
    TOP_LEFT,
];
