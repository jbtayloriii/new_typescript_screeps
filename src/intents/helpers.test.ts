import { describe, expect, test } from '@jest/globals';
import { actOrApproach } from './helpers';

const at = (x: number, y: number) => ({ x, y, roomName: 'W1N1' });

describe('actOrApproach', () => {
    const harvest = { kind: 'harvest' as const, creepName: 'c1', targetId: 'src' as Id<Source> };
    const upgrade = { kind: 'upgrade' as const, creepName: 'c1', targetId: 'ctrl' as Id<StructureController> };

    test('returns the action when in range', () => {
        expect(actOrApproach(at(10, 10), at(11, 11), harvest)).toBe(harvest);
        expect(actOrApproach(at(10, 10), at(13, 10), upgrade)).toBe(upgrade);
    });

    test('moves to the action range when out of range', () => {
        expect(actOrApproach(at(10, 10), at(12, 10), harvest))
            .toEqual({ kind: 'move', creepName: 'c1', target: at(12, 10), range: 1 });
        expect(actOrApproach(at(10, 10), at(20, 10), upgrade))
            .toEqual({ kind: 'move', creepName: 'c1', target: at(20, 10), range: 3 });
    });
});
