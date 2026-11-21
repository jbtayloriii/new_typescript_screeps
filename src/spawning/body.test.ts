import { describe, expect, test } from '@jest/globals';
import { bodyCost, buildBody, minimalBody, spawnTicks, ticksPerTile } from './body';

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

describe('bodies with a base', () => {
    const MINER = { base: [WORK, WORK, WORK, WORK, WORK, MOVE], pattern: [MOVE], maxRepeats: 2 };

    test('the base is required, repeats are optional', () => {
        expect(buildBody(MINER, 549)).toBeNull();
        expect(buildBody(MINER, 550)).toEqual([WORK, WORK, WORK, WORK, WORK, MOVE]);
        expect(buildBody(MINER, 10000)).toEqual([WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE]);
        expect(buildBody({ base: [MOVE], pattern: [], maxRepeats: 0 }, 50)).toEqual([MOVE]);
    });

    test('minimalBody is the base, or one repeat without a base', () => {
        expect(minimalBody(MINER)).toEqual(MINER.base);
        expect(minimalBody(WCM)).toEqual(WCM.pattern);
    });
});

describe('movement and spawn time', () => {
    test('ticksPerTile from fatigue on plains', () => {
        expect(ticksPerTile({ [WORK]: 5, [MOVE]: 1 })).toBe(5);
        expect(ticksPerTile({ [CARRY]: 2, [MOVE]: 2 })).toBe(1);
        expect(ticksPerTile({ [WORK]: 1 })).toBe(Infinity);
    });

    test('spawnTicks is 3 per part', () => {
        expect(spawnTicks(6)).toBe(18);
    });
});
