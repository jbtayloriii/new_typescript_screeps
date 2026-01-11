import { describe, expect, test } from '@jest/globals';
import { getInitialBaseCenter } from './base_layout_utils';
import { readFile } from '../testing/file_utils';

describe('new module', () => {
    test('getBaseCenterUsableLocation_picksLowestYPosition', () => {
        const squareDistances = [
            [1, 2, 3, 4, 5],
            [1, 2, 3, 2, 1],
            [1, 3, 4, 3, 1],
            [1, 2, 3, 1, 2],
            [1, 2, 1, 1, 2],
        ];

        expect(getInitialBaseCenter({ x: 2, y: 2 }, squareDistances)).toStrictEqual({ x: 2, y: 1 });

    });

    test('getBaseCenterOnlyInitialCoordinate_cannotFindCenter', () => {
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
    test('getBaseCenterNoUsableLocationsOfThreeOrMore_cannotFindCenter', () => {
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
