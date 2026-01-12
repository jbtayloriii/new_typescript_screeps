import { describe, expect, test } from '@jest/globals';
import { getBaseLayout, getInitialBaseCenter } from './base_layout_utils';
import { readFile } from '../testing/file_utils';
import { getDiamondMapping, getSquareMapping } from './map_plot_utils';
import { Coordinate } from 'global_types';
import { baseMapToString } from '../testing/map_utils';

describe('getBaseLayout', () => {
    test('fullMapGeneration', () => {
        const initialCoord = { x: 10, y: 10 };
        const terrainWalls = getTerrainWalls('testdata/input/terrain.txt');
        const diamondDistances = getDiamondMapping(terrainWalls, 50);
        const squareDistances = getSquareMapping(terrainWalls, 50);

        const baseLayout = getBaseLayout(initialCoord, diamondDistances, squareDistances, terrainWalls, 50);

        const expected = baseMapToString(baseLayout, terrainWalls, 50);

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
function getTerrainWalls(subpath: string): Coordinate[] {
    const terrainData = readFile(__dirname, subpath);
    const lines = terrainData.split('\n');

    let coords: Coordinate[] = [];

    for (let y = 0; y < lines.length; y++) {
        for (let x = 0; x < lines[y].length; x++) {
            if (lines[y].charAt(x) === '1') {
                coords.push({ x: x, y: y })
            }
        }
    }

    return coords;
}
