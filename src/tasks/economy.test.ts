import { describe, expect, test } from '@jest/globals';
import { computeEconomy, desiredBuilderCount, MAX_BUILDERS, STORAGE_ENERGY_PER_EXTRA_WORK, STORAGE_UPGRADE_RESERVE, upgradeWorkBudget } from './economy';
import { aRoom, energy } from 'testing/builders/room_snapshot_builder';
import { TaskMemory } from './types';
import { MyCreepSnapshot } from 'snapshot/types';

const creep = (parts: Partial<Record<BodyPartConstant, number>>, extra: Partial<MyCreepSnapshot> = {}) =>
    ({ ...aRoom().withMyCreep('c', 1, 1, { activeParts: parts }).build().creepsPresent[0], ...extra });

describe('computeEconomy', () => {
    const tasks: TaskMemory[] = [
        { name: 'm', roomName: 'W1N1', type: 'mine', sourceId: 'a' as Id<Source> },
        { name: 'h', roomName: 'W1N1', type: 'mine', sourceId: 'b' as Id<Source> },
        { name: 'u', roomName: 'W1N1', type: 'upgrade' },
    ];

    test('estimates income per mining style and upkeep of non-upgraders', () => {
        const economy = computeEconomy(tasks, new Map([
            ['m', [creep({ [WORK]: 6, [MOVE]: 1 })]],                // capped at 10/tick
            ['h', [creep({ [WORK]: 2, [CARRY]: 1, [MOVE]: 1 })]],    // 2×2×0.5 = 2/tick
            ['u', [creep({ [WORK]: 5, [CARRY]: 5, [MOVE]: 5 })]],    // not counted in upkeep
        ]));
        expect(economy.mode).toBe('static');
        expect(economy.incomePerTick).toBe(12);
        expect(economy.upkeepPerTick).toBeCloseTo((650 + 300) / 1500);
    });

    test('remote miners: 5/tick while small (unreserved), up to 10/tick when reserved-sized', () => {
        const remote: TaskMemory[] = [{ name: 'rm', roomName: 'W1N1', type: 'remoteMine', targetRoom: 'W1N2' }];
        const miner = (w: number) => creep({ [WORK]: w, [MOVE]: 3 }, { memory: { taskName: 'rm', baseRoomName: 'W1N1', role: 'miner' } });
        expect(computeEconomy(remote, new Map([['rm', [miner(3)]]])).incomePerTick).toBe(5);
        expect(computeEconomy(remote, new Map([['rm', [miner(5)]]])).incomePerTick).toBe(10);
    });

    test('spawning creeps are not income yet', () => {
        expect(computeEconomy(tasks, new Map([['m', [creep({ [WORK]: 5 }, { spawning: true })]]])).incomePerTick).toBe(0);
    });
});

describe('upgradeWorkBudget', () => {
    const economy = (incomePerTick: number, upkeepPerTick = 0) => ({ mode: 'static' as const, incomePerTick, upkeepPerTick });

    test('turns spare income into WORK parts, halved during construction, at least 1', () => {
        expect(upgradeWorkBudget(economy(20, 3), aRoom().withRcl(4).build())).toBe(15);
        expect(upgradeWorkBudget(economy(20, 3), aRoom().withRcl(4).withConstructionSite(STRUCTURE_ROAD, 1, 1).build())).toBe(7);
        expect(upgradeWorkBudget(economy(0), aRoom().withRcl(1).build())).toBe(1);
    });

    test('with a storage below the reserve, leaves part of the spare income to fill it', () => {
        const withStorage = (stored: number) =>
            aRoom().withRcl(5).withStructure(STRUCTURE_STORAGE, 1, 1, { store: energy(stored, 1e6) }).build();
        // 17 spare / (1 + 200/1500) per WORK = 15 WORK at full share.
        expect(upgradeWorkBudget(economy(20, 3), withStorage(0))).toBe(3);                              // 25% share
        expect(upgradeWorkBudget(economy(20, 3), withStorage(STORAGE_UPGRADE_RESERVE / 2))).toBe(7);    // 50% share
        expect(upgradeWorkBudget(economy(20, 3), withStorage(STORAGE_UPGRADE_RESERVE))).toBe(15);       // full share
        expect(upgradeWorkBudget(economy(0), withStorage(0))).toBe(1);
    });

    test('adds WORK for storage above the reserve, capped at 15 on RCL 8', () => {
        const stored = aRoom().withRcl(5).withStructure(STRUCTURE_STORAGE, 1, 1, { store: energy(150000, 1e6) }).build();
        expect(upgradeWorkBudget(economy(0), stored))
            .toBe(Math.floor((150000 - STORAGE_UPGRADE_RESERVE) / STORAGE_ENERGY_PER_EXTRA_WORK));
        expect(upgradeWorkBudget(economy(100), aRoom().withRcl(8).build())).toBe(15);
    });
});

describe('desiredBuilderCount', () => {
    test('scales with remaining work, from 1 to the max', () => {
        expect(desiredBuilderCount(aRoom().build())).toBe(0);
        expect(desiredBuilderCount(aRoom().withConstructionSite(STRUCTURE_ROAD, 1, 1, { progressTotal: 300 }).build())).toBe(1);
        expect(desiredBuilderCount(aRoom().withConstructionSite(STRUCTURE_STORAGE, 1, 1, { progressTotal: 30000 }).build())).toBe(MAX_BUILDERS);
    });
});
