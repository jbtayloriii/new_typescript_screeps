import { describe, expect, test } from '@jest/globals';
import { WorldPosition } from './world_position';

describe('Basic checks', () => {

    test('Different world positions with same coordinates return same ID', () => {
        const pos1 = new WorldPosition(10, 5);
        const pos2 = new WorldPosition(10, 5);

        expect(pos1.getId()).toEqual(pos2.getId());
    });

    test('WorldPosition to ID to WorldPosition returns same coordinates', () => {
        const pos1 = new WorldPosition(15000, 25500);
        const id = pos1.getId();

        const fromId = WorldPosition.fromId(id);

        expect(fromId).toStrictEqual(pos1);

        // Different instances
        expect(fromId).not.toBe(pos1);
    });
});
