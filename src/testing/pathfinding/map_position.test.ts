import { describe, expect, test } from '@jest/globals';
import { MapPosition } from './map_position';

describe('Basic checks', () => {
    test('Different instances with same coordinates return same ID', () => {
        const pos1 = new MapPosition(/* xx= */ 50, /* yy= */ 45);
        const pos2 = new MapPosition(/* xx= */ 50, /* yy= */ 45);

        expect(pos1.getId()).toEqual(pos2.getId());
    });

    test('Different instances with different x coords return different IDs', () => {
        const pos1 = new MapPosition(/* xx= */ 20, /* yy= */ 45);
        const pos2 = new MapPosition(/* xx= */ 180, /* yy= */ 45);

        // 20 * 2^16 = 1310720, plus 45
        expect(pos1.getId()).toBe(1310765);

        // 180 * 2^16 = 11796480, plus 45
        expect(pos2.getId()).toBe(11796525);
    });

    test('Different instances with different y coords return different IDs', () => {
        const pos1 = new MapPosition(/* xx= */ 1, /* yy= */ 30);
        const pos2 = new MapPosition(/* xx= */ 1, /* yy= */ 45);

        // 1 * 2^16 = 65536, plus 30
        expect(pos1.getId()).toBe(65566);

        // 1 * 2^16 = 65536, plus 45
        expect(pos2.getId()).toBe(65581);
    });

    test('Different instances with different x and y coords return different IDs', () => {
        const pos1 = new MapPosition(/* xx= */ 0, /* yy= */ 2);
        const pos2 = new MapPosition(/* xx= */ 1, /* yy= */ 4);

        // 0 * 2^16 = 0, plus 2
        expect(pos1.getId()).toBe(2);

        // 1 * 2^16 = 65536, plus 4
        expect(pos2.getId()).toBe(65540);
    });
});
