import { describe, expect, test } from '@jest/globals';
import { summarizeFailures } from './failures';
import { Intent } from './types';

const move: Intent = { kind: 'move', creepName: 'c', target: { x: 1, y: 1, roomName: 'W1N1' }, range: 1 };
const harvest: Intent = { kind: 'harvest', creepName: 'c', targetId: 's' as Id<Source> };

describe('summarizeFailures', () => {
    test('returns null when everything succeeded or failed routinely', () => {
        expect(summarizeFailures([
            { intent: harvest, code: OK },
            { intent: move, code: ERR_TIRED },
            { intent: move, code: ERR_BUSY },
        ])).toBeNull();
    });

    test('counts failures by kind and code', () => {
        expect(summarizeFailures([
            { intent: harvest, code: ERR_NOT_ENOUGH_RESOURCES },
            { intent: harvest, code: ERR_NOT_ENOUGH_RESOURCES },
            { intent: move, code: ERR_NO_PATH },
        ])).toBe(`harvest:${ERR_NOT_ENOUGH_RESOURCES} x2, move:${ERR_NO_PATH}`);
    });
});
