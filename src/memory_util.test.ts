import { describe, expect, test } from '@jest/globals';
import { isFreshRespawn } from './memory_util';

describe('isFreshRespawn', () => {
    test('is true only for one spawn and no creeps', () => {
        expect(isFreshRespawn(1, 0)).toBe(true);
        expect(isFreshRespawn(1, 1)).toBe(false);
        expect(isFreshRespawn(2, 0)).toBe(false);
        expect(isFreshRespawn(0, 0)).toBe(false);
    });
});
