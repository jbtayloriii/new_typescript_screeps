import { Coordinate } from 'global_types';
import { readFile } from '../../testing/file_utils';
import { initRooms } from '../../testing/mocks';
import { LayoutInput } from '../base_layout_utils';

/**
 * Test rooms for the layout planner, from `testdata/input/<room>.txt`: one line per row,
 * '1' wall, '2' swamp, 'S' source, 'C' controller, 'M' mineral, anything else plain.
 */
export interface TestRoom {
    readonly name: RoomName;
    readonly terrainGrid: number[][];
    readonly sources: Coordinate[];
    readonly controller?: Coordinate;
    readonly mineral?: Coordinate;
}

/** Rooms with a real first spawn (W23S31 and W11S14 are bases this bot ran, with saved v1 layouts). */
export const TEST_ROOM_SPAWNS: { [room: string]: Coordinate } = {
    E23S15: { x: 40, y: 40 },
    E22S15: { x: 20, y: 20 },
    W23S31: { x: 30, y: 18 },
    W11S14: { x: 12, y: 39 },
};

export function loadTestRoom(name: RoomName): TestRoom {
    const lines = readFile(__dirname, `input/${name}.txt`).split('\n');
    const terrainGrid: number[][] = Array.from({ length: 50 }, () => Array(50).fill(0));
    const sources: Coordinate[] = [];
    let controller: Coordinate | undefined;
    let mineral: Coordinate | undefined;
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            const ch = lines[y]?.charAt(x);
            if (ch === '1') terrainGrid[y][x] = TERRAIN_MASK_WALL;
            else if (ch === '2') terrainGrid[y][x] = TERRAIN_MASK_SWAMP;
            else if (ch === 'S') { sources.push({ x, y }); terrainGrid[y][x] = TERRAIN_MASK_WALL; }
            else if (ch === 'C') { controller = { x, y }; terrainGrid[y][x] = TERRAIN_MASK_WALL; }
            else if (ch === 'M') { mineral = { x, y }; terrainGrid[y][x] = TERRAIN_MASK_WALL; }
        }
    }
    return { name, terrainGrid, sources, controller, mineral };
}

/** Loads a room into the mock PathFinder and returns planner input for it. */
export function layoutInputFor(name: RoomName, overrides: Partial<LayoutInput> = {}): LayoutInput {
    const room = loadTestRoom(name);
    initRooms([{ room: name, terrain: room.terrainGrid }]);
    return {
        roomName: name,
        terrain: (x, y) => room.terrainGrid[y][x],
        spawn: TEST_ROOM_SPAWNS[name],
        sources: room.sources,
        controller: room.controller,
        mineral: room.mineral,
        ...overrides,
    };
}
