import { describe, expect, test } from '@jest/globals';
import { getBaseLayout, getInitialBaseCenter } from './base_layout_utils';
import { readFile } from '../testing/file_utils';
import { getDiamondMapping, getSquareMapping } from './map_plot_utils';
import { Coordinate } from 'global_types';
import { baseMapToString } from '../utils/map_utils';
import { mockInstanceOf, mockStructure } from 'screeps-jest';
import { initRooms } from '../testing/mocks';

describe('getBaseLayout', () => {
    test('fullMapGeneration', () => {
        const initialCoord: RoomPosition = mockInstanceOf<RoomPosition>({ roomName: "E23S15", x: 40, y: 40 });


        const { walls: terrainWalls, terrainLayout: terrainLayout } = getTerrainData('terrain');

        const rooms = ["E23S15", 'E22S15'];
        const mockRooms = rooms.map(r => {
            const { terrainLayout: t } = getTerrainData(r);
            return { room: r, terrain: t };
        });

        initRooms(mockRooms);

        const diamondDistances = getDiamondMapping(terrainWalls, 50);
        const squareDistances = getSquareMapping(terrainWalls, 50);

        const mockSources: Source[] = [
            mockInstanceOf<Source>({
                id: 'source1' as Id<Source>,
                pos: { roomName: "E23S15", x: 18, y: 23 } as RoomPosition
            }),
            mockInstanceOf<Source>({
                id: 'source1' as Id<Source>,
                pos: { roomName: "E23S15", x: 33, y: 6 } as RoomPosition
            })
        ]

        const baseLayout = getBaseLayout(
            initialCoord,
            mockSources,
            diamondDistances,
            squareDistances,
            50);

        const expected = baseMapToString(baseLayout, terrainWalls, mockSources, 50, 8);

        console.log(expected);

        // TODO: finish this test

        // expect(getInitialBaseCenter({ x: 2, y: 2 }, squareDistances)).toStrictEqual({ x: 2, y: 1 });
    });


});

describe('getBaseCenter', () => {
    test('usableLocation_picksLowestYPosition', () => {
        const squareDistances = [
            [1, 2, 3, 4, 5],
            [1, 2, 3, 2, 1],
            [1, 3, 4, 3, 1],
            [1, 2, 3, 1, 2],
            [1, 2, 1, 1, 2],
        ];

        expect(getInitialBaseCenter({ x: 2, y: 2 }, squareDistances)).toStrictEqual({ x: 2, y: 1 });
    });

    test('onlyInitialCoordinate_cannotFindCenter', () => {
        // [2, 2] is distance 4 (which is OK), but we can't use that.
        const squareDistances = [
            [1, 2, 3, 4, 5],
            [1, 2, 2, 2, 1],
            [1, 2, 4, 2, 1],
            [1, 2, 1, 1, 2],
            [1, 2, 1, 1, 2],
        ];

        expect(getInitialBaseCenter({ x: 2, y: 2 }, squareDistances)).toBeNull();
    });

    test('noUsableLocationsOfThreeOrMore_cannotFindCenter', () => {
        const squareDistances = [
            [1, 2, 3, 4, 5],
            [1, 2, 2, 2, 1],
            [1, 2, 1, 2, 1],
            [1, 2, 1, 1, 2],
            [1, 2, 1, 1, 2],
        ];

        expect(getInitialBaseCenter({ x: 3, y: 3 }, squareDistances)).toBeNull();
    });
});

/** Returns a list of all walls for a given test filepath.
 * 
 * Walls are denoted by '1' in the terrain map.
 */
function getTerrainData(subpath: string): { walls: Coordinate[], sources: Source[], controller: StructureController, terrainLayout: number[][] } {
    const fullSubpath = 'testdata/input/' + subpath + '.txt'
    const terrainData = readFile(__dirname, fullSubpath);
    const lines = terrainData.split('\n');

    let walls: Coordinate[] = [];
    let sources: Source[] = [];
    let controllerPos: Coordinate = { x: -1, y: -1 };
    const terrainLayout: number[][] = Array.from({ length: 50 }, () => Array(50).fill(0));
    ;

    for (let y = 0; y < lines.length; y++) {
        for (let x = 0; x < lines[y].length; x++) {
            if (lines[y].charAt(x) === '1') { // Wall
                walls.push({ x: x, y: y })
                terrainLayout[y][x] = 1;
            } else if (lines[y].charAt(x) === 'C') { // Controller
                controllerPos = { x: x, y: y };
                terrainLayout[y][x] = 1;
            } else if (lines[y].charAt(x) === 'S') { // Source
                sources.push(mockInstanceOf<Source>({ pos: { x: x, y: y } }));
                terrainLayout[y][x] = 1;
            } else if (lines[y].charAt(x) === '2') { // Swamp
                terrainLayout[y][x] = 2;
            }
        }
    }

    return {
        walls: walls,
        sources: sources,
        controller: mockInstanceOf<StructureController>({ pos: { x: controllerPos.x, y: controllerPos.y } }),
        terrainLayout: terrainLayout,
    }
}
