import { describe, expect, test } from '@jest/globals';
import { parseFlag } from './flags';

const flag = (color: ColorConstant) => ({ name: 'f', color, secondaryColor: COLOR_RED, pos: { x: 20, y: 30, roomName: 'W2N2' } });

describe('parseFlag', () => {
    test('maps primary colors to directives', () => {
        expect(parseFlag(flag(COLOR_YELLOW))).toEqual({ type: 'remoteMine', targetRoom: 'W2N2', source: 'flag', flagName: 'f', spawnPos: undefined });
        expect(parseFlag(flag(COLOR_WHITE))?.type).toBe('scout');
        expect(parseFlag(flag(COLOR_PURPLE))).toMatchObject({ type: 'claim', spawnPos: { x: 20, y: 30 } });
    });

    test('ignores other colors', () => {
        expect(parseFlag(flag(COLOR_RED))).toBeNull();
    });
});
