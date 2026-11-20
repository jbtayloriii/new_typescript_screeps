import { describe, expect, test } from '@jest/globals';
import { bodyCost, buildBody } from './body';

const WCM = { pattern: [WORK, CARRY, MOVE], maxRepeats: 3 };

describe('bodyCost', () => {
    test('sums part costs', () => {
        expect(bodyCost([WORK, CARRY, MOVE])).toBe(200);
        expect(bodyCost([])).toBe(0);
    });
});

describe('buildBody', () => {
    test('repeats the pattern as many times as energy allows', () => {
        expect(buildBody(WCM, 300)).toEqual([WORK, CARRY, MOVE]);
        expect(buildBody(WCM, 400)).toEqual([WORK, CARRY, MOVE, WORK, CARRY, MOVE]);
    });

    test('caps at max repeats', () => {
        expect(buildBody(WCM, 10000)).toHaveLength(9);
    });

    test('caps at 50 parts', () => {
        expect(buildBody({ pattern: [MOVE], maxRepeats: 100 }, 10000)).toHaveLength(50);
    });

    test('returns null when not even one repeat is affordable', () => {
        expect(buildBody(WCM, 199)).toBeNull();
    });
});
