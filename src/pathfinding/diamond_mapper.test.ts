import { describe, expect, test } from '@jest/globals';
import { getDiamondMapping, initializeEdges, WeightedPosition } from './diamond_mapper';

describe('getDiamondMapping module', () => {
    test('Initialize edges 5x5', () => {
        let mapSize = 5;
        let tileArr = Array.from({ length: mapSize }, () => Array(mapSize).fill(0));
        let queue: WeightedPosition[] = [];

        let expectedTileArr = [
            [-1, -1, -1, -1, -1],
            [-1, 0, 0, 0, -1],
            [-1, 0, 0, 0, -1],
            [-1, 0, 0, 0, -1],
            [-1, -1, -1, -1, -1],
        ]

        initializeEdges(tileArr, queue, mapSize);

        // One element for each cell directly inside
        expect(queue.length).toBe(8);
        expect(tileArr).toStrictEqual(expectedTileArr);
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
