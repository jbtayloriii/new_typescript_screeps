import { describe, expect, test } from '@jest/globals';
import {
    enemyProfile, homeDefenseNeed, homeDefenseSize, maxThreat, homeThreats, MAX_HOME_DEFENSE_SIZE, towerKillTicks,
} from './home_defense';
import { aRoom } from 'testing/builders/room_snapshot_builder';
import { HostileCreepSnapshot } from 'snapshot/types';

/** The dismantlers that took W23S31: 6 TOUGH, 6 WORK, 12 MOVE. */
const dismantler: Partial<HostileCreepSnapshot> = {
    activeParts: { [TOUGH]: 6, [WORK]: 6, [MOVE]: 12 }, hits: 2400, hitsMax: 2400, owner: 'Cyborger',
};
/** W23S31's harassers: 1 RANGED_ATTACK, 1 HEAL, 3 MOVE. */
const harasser: Partial<HostileCreepSnapshot> = {
    activeParts: { [RANGED_ATTACK]: 1, [HEAL]: 1, [MOVE]: 3 }, hits: 500, hitsMax: 500, owner: 'Cyborger',
};

describe('homeThreats', () => {
    test('player creeps that can attack, dismantle or claim', () => {
        const room = aRoom().withRcl(3)
            .withHostile(10, 10, dismantler)
            .withHostile(11, 11, { activeParts: { [CLAIM]: 1, [MOVE]: 1 }, owner: 'p' })
            .withHostile(12, 12, { activeParts: { [HEAL]: 5, [MOVE]: 5 }, owner: 'p' })
            .withHostile(13, 13, { activeParts: { [MOVE]: 1 }, owner: 'p' })
            .withHostile(14, 14, { activeParts: { [ATTACK]: 5 }, owner: 'Invader' })
            .withHostile(15, 15, { activeParts: { [ATTACK]: 5 }, owner: 'Source Keeper' })
            .build();
        expect(homeThreats(room).map(h => h.pos.x)).toEqual([10, 11]);
    });
});

describe('towerKillTicks', () => {
    test('total hits over the towers\' damage at range, minus healing', () => {
        const room = aRoom().withRcl(5).withTower(10, 10).withHostile(12, 12, dismantler).build();
        expect(towerKillTicks(room, room.hostileCreeps)).toBe(4);
        const healed = aRoom().withRcl(5).withTower(10, 10).withHostile(12, 12, { ...dismantler, activeParts: { [WORK]: 1, [HEAL]: 50 } }).build();
        expect(towerKillTicks(healed, healed.hostileCreeps)).toBe(Infinity);
        expect(towerKillTicks(aRoom().withRcl(5).withHostile(12, 12, dismantler).build(), [])).toBe(0);
    });

    test('towers without energy for a shot do nothing', () => {
        const room = aRoom().withRcl(5).withTower(10, 10, { energy: 5 }).withHostile(12, 12, dismantler).build();
        expect(towerKillTicks(room, room.hostileCreeps)).toBe(Infinity);
    });
});

describe('homeDefenseSize', () => {
    test('their combat parts over one defender\'s, plus one, from 2 to 6', () => {
        const one = aRoom().withHostile(1, 1, dismantler).build().hostileCreeps;
        // 800 capacity: 6 ATTACK per melee defender. 6 WORK → 1 + 1.
        expect(homeDefenseSize(one, 800)).toBe(2);
        const wave = aRoom().withHostile(1, 1, { ...dismantler, activeParts: { [WORK]: 90 } }).build().hostileCreeps;
        expect(homeDefenseSize(wave, 1800)).toBe(MAX_HOME_DEFENSE_SIZE);
        const big = aRoom().withHostile(1, 1, { activeParts: { [ATTACK]: 25, [MOVE]: 25 }, owner: 'p' }).build().hostileCreeps;
        expect(homeDefenseSize(big, 1800)).toBe(4);
    });
});

describe('homeDefenseNeed (W23S31 cases)', () => {
    test('harassers: towers handle them; without a tower (RCL 2) defenders go out', () => {
        const withTower = aRoom().withRcl(3).withTower(28, 18).withHostile(32, 20, harasser).withHostile(33, 21, harasser).withHostile(31, 21, harasser).build();
        expect(homeDefenseNeed(withTower, 800)).toBeNull();
        const noTower = aRoom().withRcl(2).withHostile(32, 20, harasser).withHostile(33, 21, harasser).withHostile(31, 21, harasser).build();
        expect(homeDefenseNeed(noTower, 550)).toEqual({
            size: 3,
            threat: { attack: 0, ranged: 3, work: 0, heal: 3 },
            reason: '3 attackers (Cyborger; ranged); no tower can out-damage them',
        });
    });

    test('a single dismantler is left to the tower', () => {
        const room = aRoom().withRcl(5).withTower(28, 18).withHostile(30, 20, dismantler).build();
        expect(homeDefenseNeed(room, 1800)).toBeNull();
    });

    test('the final wave of 15 dismantlers gets the largest home defense', () => {
        let builder = aRoom().withRcl(5).withTower(28, 18, { energy: 820 });
        for (let i = 0; i < 15; i++) builder = builder.withHostile(25 + (i % 5), 20 + Math.floor(i / 5), dismantler);
        const need = homeDefenseNeed(builder.build(), 1800);
        expect(need).toEqual({
            size: MAX_HOME_DEFENSE_SIZE,
            threat: { attack: 0, ranged: 0, work: 90, heal: 0 },
            reason: '15 attackers (Cyborger; dismantlers); towers need ~60 ticks',
        });
    });
});

describe('enemyProfile and maxThreat', () => {
    const t = (attack: number, ranged: number, work = 0, heal = 0) => ({ attack, ranged, work, heal });

    test('dismantlers have no attack or ranged parts; otherwise whichever has twice the other', () => {
        expect(enemyProfile(t(0, 0, 40, 5))).toBe('dismantlers');
        expect(enemyProfile(t(10, 5))).toBe('melee');
        expect(enemyProfile(t(4, 8))).toBe('ranged');
        expect(enemyProfile(t(6, 5))).toBe('mixed');
    });

    test('a defense remembers the most of each part it has seen', () => {
        expect(maxThreat(undefined, t(1, 2))).toEqual(t(1, 2));
        expect(maxThreat(t(10, 0, 30, 0), t(0, 6, 5, 2))).toEqual(t(10, 6, 30, 2));
    });
});
