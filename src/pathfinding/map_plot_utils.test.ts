import { describe, expect, test } from '@jest/globals';
import { getDiamondMapping, getSquareMapping, initializeEdges, WeightedPosition } from './map_plot_utils';

describe('Initialization', () => {
    test('Initialize edges 5x5', () => {
        let mapSize = 5;
        let tileArr = Array.from({ length: mapSize }, () => Array(mapSize).fill(0));
        let visitedArr = Array.from({ length: mapSize }, () => Array(mapSize).fill(false));
        let queue: WeightedPosition[] = [];

        let expectedTileArr = [
            [-1, -1, -1, -1, -1],
            [-1, 0, 0, 0, -1],
            [-1, 0, 0, 0, -1],
            [-1, 0, 0, 0, -1],
            [-1, -1, -1, -1, -1],
        ]

        let expectedVisitedArr = [
            [true, true, true, true, true],
            [true, true, true, true, true],
            [true, true, false, true, true],
            [true, true, true, true, true],
            [true, true, true, true, true],
        ]

        initializeEdges(tileArr, visitedArr, queue, mapSize);

        // One element for each cell directly inside
        expect(queue.length).toBe(8);
        expect(tileArr).toStrictEqual(expectedTileArr);
        expect(visitedArr).toStrictEqual(expectedVisitedArr);
    });

    test('Initialize edges 10x10', () => {
        let mapSize = 10;
        let tileArr = Array.from({ length: mapSize }, () => Array(mapSize).fill(0));
        let visitedArr = Array.from({ length: mapSize }, () => Array(mapSize).fill(false));
        let queue: WeightedPosition[] = [];

        let expectedVisitedArr = [
            [true, true, true, true, true, true, true, true, true, true],
            [true, true, true, true, true, true, true, true, true, true],
            [true, true, false, false, false, false, false, false, true, true],
            [true, true, false, false, false, false, false, false, true, true],
            [true, true, false, false, false, false, false, false, true, true],
            [true, true, false, false, false, false, false, false, true, true],
            [true, true, false, false, false, false, false, false, true, true],
            [true, true, false, false, false, false, false, false, true, true],
            [true, true, true, true, true, true, true, true, true, true],
            [true, true, true, true, true, true, true, true, true, true]
        ]

        let expectedTileArr = [
            [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [-1, 0, 0, 0, 0, 0, 0, 0, 0, -1],
            [-1, 0, 0, 0, 0, 0, 0, 0, 0, -1],
            [-1, 0, 0, 0, 0, 0, 0, 0, 0, -1],
            [-1, 0, 0, 0, 0, 0, 0, 0, 0, -1],
            [-1, 0, 0, 0, 0, 0, 0, 0, 0, -1],
            [-1, 0, 0, 0, 0, 0, 0, 0, 0, -1],
            [-1, 0, 0, 0, 0, 0, 0, 0, 0, -1],
            [-1, 0, 0, 0, 0, 0, 0, 0, 0, -1],
            [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
        ]

        initializeEdges(tileArr, visitedArr, queue, mapSize);

        // One element for each cell directly inside -> 8, 8, 6, 6 for walls
        expect(queue.length).toBe(28);
        expect(tileArr).toStrictEqual(expectedTileArr);
        expect(visitedArr).toStrictEqual(expectedVisitedArr);
    });
});

describe('Diamond mapping', () => {
    test('No walls 10x10', () => {
        let actual = getDiamondMapping([], 10);

        let expected = [
            [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [-1, 1, 1, 1, 1, 1, 1, 1, 1, -1],
            [-1, 1, 2, 2, 2, 2, 2, 2, 1, -1],
            [-1, 1, 2, 3, 3, 3, 3, 2, 1, -1],
            [-1, 1, 2, 3, 4, 4, 3, 2, 1, -1],
            [-1, 1, 2, 3, 4, 4, 3, 2, 1, -1],
            [-1, 1, 2, 3, 3, 3, 3, 2, 1, -1],
            [-1, 1, 2, 2, 2, 2, 2, 2, 1, -1],
            [-1, 1, 1, 1, 1, 1, 1, 1, 1, -1],
            [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
        ]

        expect(mappingToPrintable(actual)).toStrictEqual(mappingToPrintable(expected));
    });

    test('Edge walls 10x10', () => {
        let walls = [
            { x: 0, y: 0 },
            { x: 9, y: 9 },
            { x: 0, y: 5 },
            { x: 9, y: 4 },
            { x: 3, y: 0 },
            { x: 6, y: 9 },
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 5, y: 5 },
        ];
        let actual = getDiamondMapping(walls, 10);

    });

    test('Inner walls 10x10', () => {
        let walls = [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 5, y: 5 },
        ];
        let actual = getDiamondMapping(walls, 10);

        let expected = [
            [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [-1, -1, -1, 1, 1, 1, 1, 1, 1, -1],
            [-1, 1, 1, 2, 2, 2, 2, 2, 1, -1],
            [-1, 1, 2, 3, 3, 2, 3, 2, 1, -1],
            [-1, 1, 2, 3, 2, 1, 2, 2, 1, -1],
            [-1, 1, 2, 2, 1, -1, 1, 2, 1, -1],
            [-1, 1, 2, 3, 2, 1, 2, 2, 1, -1],
            [-1, 1, 2, 2, 2, 2, 2, 2, 1, -1],
            [-1, 1, 1, 1, 1, 1, 1, 1, 1, -1],
            [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
        ]

        expect(mappingToPrintable(actual)).toStrictEqual(mappingToPrintable(expected));
    });

    test('No walls 5x5', () => {
        let actual = getDiamondMapping([], 5);

        let expected = [
            [-1, -1, -1, -1, -1],
            [-1, 1, 1, 1, -1],
            [-1, 1, 2, 1, -1],
            [-1, 1, 1, 1, -1],
            [-1, -1, -1, -1, -1],
        ]

        expect(mappingToPrintable(actual)).toStrictEqual(mappingToPrintable(expected));
    });

    test('Inner walls 5x5', () => {
        let walls = [{ x: 1, y: 1 }, { x: 2, y: 1 }];
        let actual = getDiamondMapping(walls, 5);

        let expected = [
            [-1, -1, -1, -1, -1],
            [-1, -1, -1, 1, -1],
            [-1, 1, 1, 1, -1],
            [-1, 1, 1, 1, -1],
            [-1, -1, -1, -1, -1],
        ]

        expect(mappingToPrintable(actual)).toStrictEqual(mappingToPrintable(expected));
    });
});


describe('Square mapping', () => {
    test('No walls 10x10', () => {
        let actual = getSquareMapping([], 10);

        let expected = [
            [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [-1, 1, 1, 1, 1, 1, 1, 1, 1, -1],
            [-1, 1, 2, 2, 2, 2, 2, 2, 1, -1],
            [-1, 1, 2, 3, 3, 3, 3, 2, 1, -1],
            [-1, 1, 2, 3, 4, 4, 3, 2, 1, -1],
            [-1, 1, 2, 3, 4, 4, 3, 2, 1, -1],
            [-1, 1, 2, 3, 3, 3, 3, 2, 1, -1],
            [-1, 1, 2, 2, 2, 2, 2, 2, 1, -1],
            [-1, 1, 1, 1, 1, 1, 1, 1, 1, -1],
            [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
        ]

        expect(mappingToPrintable(actual)).toStrictEqual(mappingToPrintable(expected));
    });

    test('Inner walls 10x10', () => {
        let walls = [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 5, y: 5 },
        ];
        let actual = getSquareMapping(walls, 10);

        let expected = [
            [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            [-1, -1, -1, 1, 1, 1, 1, 1, 1, -1],
            [-1, 1, 1, 1, 2, 2, 2, 2, 1, -1],
            [-1, 1, 2, 2, 2, 2, 2, 2, 1, -1],
            [-1, 1, 2, 2, 1, 1, 1, 2, 1, -1],
            [-1, 1, 2, 2, 1, -1, 1, 2, 1, -1],
            [-1, 1, 2, 2, 1, 1, 1, 2, 1, -1],
            [-1, 1, 2, 2, 2, 2, 2, 2, 1, -1],
            [-1, 1, 1, 1, 1, 1, 1, 1, 1, -1],
            [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
        ]

        expect(mappingToPrintable(actual)).toStrictEqual(mappingToPrintable(expected));
    });

    test('No walls 5x5', () => {
        let actual = getSquareMapping([], 5);

        let expected = [
            [-1, -1, -1, -1, -1],
            [-1, 1, 1, 1, -1],
            [-1, 1, 2, 1, -1],
            [-1, 1, 1, 1, -1],
            [-1, -1, -1, -1, -1],
        ]

        expect(mappingToPrintable(actual)).toStrictEqual(mappingToPrintable(expected));
    });

    test('Inner walls 5x5', () => {
        let walls = [{ x: 1, y: 1 }, { x: 2, y: 1 }];
        let actual = getSquareMapping(walls, 5);

        let expected = [
            [-1, -1, -1, -1, -1],
            [-1, -1, -1, 1, -1],
            [-1, 1, 1, 1, -1],
            [-1, 1, 1, 1, -1],
            [-1, -1, -1, -1, -1],
        ]

        expect(mappingToPrintable(actual)).toStrictEqual(mappingToPrintable(expected));
    });
});

/** Converts mappings to a more printable version, for test output printing.
 * 
 * Each mapping row is converted to a string with 3 characters used for each value.
 */
function mappingToPrintable(mapping: number[][]): string[] {
    return mapping.map(row => row.map(v => `${v}`.padStart(3, " ")).join(""));
}
