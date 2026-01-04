import { describe, expect, test } from '@jest/globals';
import { getDiamondMapping, initializeEdges, WeightedPosition } from './diamond_mapper';

describe('10x10 diamond', () => {
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

        expect(actual).toStrictEqual(expected);
    });

    test('Some walls 10x10', () => {
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

        expect(actual).toStrictEqual(expected);
    });

});

describe('getDiamondMapping module', () => {
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

    test('No walls 5x5', () => {
        let actual = getDiamondMapping([], 5);

        let expected = [
            [-1, -1, -1, -1, -1],
            [-1, 1, 1, 1, -1],
            [-1, 1, 2, 1, -1],
            [-1, 1, 1, 1, -1],
            [-1, -1, -1, -1, -1],
        ]

        expect(actual).toStrictEqual(expected);
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

        expect(actual).toStrictEqual(expected);
    });
});
