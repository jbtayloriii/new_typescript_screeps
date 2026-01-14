import { describe, expect, test } from '@jest/globals';
import { getBaseLayout, getInitialBaseCenter } from './base_layout_utils';
import { readFile } from '../testing/file_utils';
import { getDiamondMapping, getSquareMapping } from './map_plot_utils';
import { Coordinate } from 'global_types';
import { baseMapToString } from '../utils/map_utils';
import { mockInstanceOf, mockStructure } from 'screeps-jest';

describe('getBaseLayout', () => {
    test('fullMapGeneration', () => {
        const initialCoord: RoomPosition = mockInstanceOf<RoomPosition>({ x: 40, y: 40 });
        const { walls: terrainWalls } = getTerrainWalls('testdata/input/terrain.txt');
        const diamondDistances = getDiamondMapping(terrainWalls, 50);
        const squareDistances = getSquareMapping(terrainWalls, 50);

        const mockSources: Source[] = [
            mockInstanceOf<Source>({
                id: 'source1' as Id<Source>,
                pos: { x: 40, y: 40 } as RoomPosition
            })
        ]

        const baseLayout = getBaseLayout(
            initialCoord,
            mockSources,
            diamondDistances,
            squareDistances,
            50);

        const expected = baseMapToString(baseLayout, terrainWalls, 50, 8);

        console.log(expected);

        // console.log(diamondDistances.map(row => row.map(v => v == -1 ? '0' : v).join('')).join('\n'));

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
function getTerrainWalls(subpath: string): { walls: Coordinate[], sources: Source[], controller: StructureController } {
    const terrainData = readFile(__dirname, subpath);
    const lines = terrainData.split('\n');

    let walls: Coordinate[] = [];
    let sources: Source[] = [];
    let controllerPos: Coordinate = { x: -1, y: -1 };

    for (let y = 0; y < lines.length; y++) {
        for (let x = 0; x < lines[y].length; x++) {
            if (lines[y].charAt(x) === '1') {
                walls.push({ x: x, y: y })
            } else if (lines[y].charAt(x) === 'C') {
                controllerPos = { x: x, y: y };
            } else if (lines[y].charAt(x) === 'S') {

            }
        }
    }

    return {
        walls: walls,
        sources: sources,
        controller: mockInstanceOf<StructureController>({ pos: { x: controllerPos.x, y: controllerPos.y } }),
    }
}
