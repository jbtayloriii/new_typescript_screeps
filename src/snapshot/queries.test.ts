import { describe, expect, test } from '@jest/globals';
import { findClosestByRange, getMyStructures, getRange, isInRange } from './queries';
import { aRoom } from 'testing/builders/room_snapshot_builder';

const at = (x: number, y: number, roomName = 'W1N1') => ({ x, y, roomName });

describe('getRange', () => {
    test('is the Chebyshev distance', () => {
        expect(getRange(at(10, 10), at(13, 11))).toBe(3);
        expect(getRange(at(10, 10), at(10, 10))).toBe(0);
    });

    test('is infinite across rooms', () => {
        expect(getRange(at(10, 10), at(10, 10, 'W2N1'))).toBe(Infinity);
    });

    test('isInRange includes the boundary', () => {
        expect(isInRange(at(10, 10), at(13, 10), 3)).toBe(true);
        expect(isInRange(at(10, 10), at(14, 10), 3)).toBe(false);
    });
});

describe('findClosestByRange', () => {
    test('returns the closest item, keeping the first on ties', () => {
        const items = [{ pos: at(20, 20), n: 'far' }, { pos: at(12, 10), n: 'a' }, { pos: at(10, 12), n: 'b' }];
        expect(findClosestByRange(at(10, 10), items)?.n).toBe('a');
    });

    test('returns null for no items or items only in other rooms', () => {
        expect(findClosestByRange(at(10, 10), [])).toBeNull();
        expect(findClosestByRange(at(10, 10), [{ pos: at(10, 10, 'W2N1') }])).toBeNull();
    });
});

describe('getMyStructures', () => {
    test('filters by type and ownership', () => {
        const room = aRoom()
            .withTower(10, 10)
            .withTower(11, 11, { owner: 'other' })
            .withStructure(STRUCTURE_ROAD, 12, 12, { owner: 'none' })
            .build();
        const towers = getMyStructures(room, STRUCTURE_TOWER);
        expect(towers).toHaveLength(1);
        expect(towers[0].pos).toEqual(at(10, 10));
    });
});
