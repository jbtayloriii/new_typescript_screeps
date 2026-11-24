import { describe, expect, test } from '@jest/globals';
import { assessBaseThreat, BREAK_HORIZON_TICKS, decideSafeMode, structureDamagePerTick, towerDamageAt } from './safe_mode';
import { aRoom } from 'testing/builders/room_snapshot_builder';
import { HostileCreepSnapshot } from 'snapshot/types';

const attacker: Partial<HostileCreepSnapshot> = { activeParts: { [ATTACK]: 5, [MOVE]: 5 }, owner: 'enemy' };

/** The dismantlers that took W23S31 (Cyborger's "mch" creeps): 6 TOUGH, 6 WORK, 12 MOVE. */
const dismantler: Partial<HostileCreepSnapshot> = {
    activeParts: { [TOUGH]: 6, [WORK]: 6, [MOVE]: 12 }, hits: 2400, hitsMax: 2400, owner: 'Cyborger',
};
/** The harassers that made W23S31 spend its safe mode at RCL 3 ("arc"): 1 RANGED_ATTACK, 1 HEAL, 3 MOVE. */
const harasser: Partial<HostileCreepSnapshot> = {
    activeParts: { [RANGED_ATTACK]: 1, [HEAL]: 1, [MOVE]: 3 }, hits: 500, hitsMax: 500, owner: 'Cyborger',
};

describe('decideSafeMode', () => {
    test('activates when attackers can destroy the spawn soon and there are no towers', () => {
        const room = aRoom().withRcl(3).withSpawn(10, 10, { hits: 5000, hitsMax: 5000 }).withHostile(12, 12, attacker).build();
        const intents = decideSafeMode(room);
        expect(intents).toHaveLength(1);
        expect(intents[0]).toMatchObject({ kind: 'activateSafeMode', controllerId: room.controller!.id });
        expect(intents[0].kind === 'activateSafeMode' && intents[0].reason)
            .toBe('1 hostile (enemy) can destroy the spawn at 10,10 in ~34 ticks; towers can\'t out-damage their healing');
    });

    test('lets towers handle attackers they can kill before the spawn falls, even if it is damaged', () => {
        const coping = aRoom().withRcl(3).withSpawn(10, 10).withTower(15, 15).withHostile(12, 12, attacker).build();
        expect(decideSafeMode(coping)).toEqual([]);
        const hurt = aRoom().withRcl(3).withSpawn(10, 10, { hits: 4000, hitsMax: 5000 }).withTower(15, 15).withHostile(12, 12, attacker).build();
        expect(decideSafeMode(hurt)).toEqual([]);
    });

    test('activates when healers out-heal the towers', () => {
        const healers = aRoom().withRcl(3).withSpawn(10, 10).withTower(15, 15)
            .withHostile(12, 12, { activeParts: { [ATTACK]: 10, [HEAL]: 60 }, owner: 'enemy' }).build();
        expect(assessBaseThreat(healers)).toContain('towers can\'t out-damage their healing');
    });

    test('ignores hostiles that are far away, harmless or slow to do damage', () => {
        expect(decideSafeMode(aRoom().withRcl(3).withSpawn(10, 10).withHostile(40, 40, attacker).build())).toEqual([]);
        expect(decideSafeMode(aRoom().withRcl(3).withSpawn(10, 10).withHostile(12, 12, { activeParts: { [MOVE]: 1 } }).build())).toEqual([]);
        // 1 ATTACK part: 30 damage a tick, 167 ticks to destroy a spawn.
        expect(decideSafeMode(aRoom().withRcl(3).withSpawn(10, 10, { hits: 5000, hitsMax: 5000 }).withHostile(11, 11).build())).toEqual([]);
    });

    test('respects availability, cooldown and an active safe mode', () => {
        const withController = (overrides: object) => aRoom().withRcl(3, overrides).withSpawn(10, 10).withHostile(12, 12, attacker).build();
        expect(decideSafeMode(withController({ safeModeAvailable: 0 }))).toEqual([]);
        expect(decideSafeMode(withController({ safeModeCooldown: 100 }))).toEqual([]);
        expect(decideSafeMode(withController({ safeMode: 500 }))).toEqual([]);
    });

    test('leaves a lone claimer alone, but not one backed by attackers', () => {
        const claimer = { activeParts: { [CLAIM]: 5, [MOVE]: 5 }, owner: 'enemy' };
        expect(decideSafeMode(aRoom().withRcl(3).withHostile(24, 24, claimer).build())).toEqual([]);
        const backed = aRoom().withRcl(3).withSpawn(10, 10, { hits: 5000, hitsMax: 5000 })
            .withHostile(24, 24, claimer).withHostile(40, 40, attacker).build();
        expect(assessBaseThreat(backed)).toMatch(/^claimer .* would block safe mode, with 1 hostile/);
    });
});

describe('W23S31 (lost Nov 23 2026)', () => {
    test('no safe mode for three harassers near the spawn at RCL 3 with no tower (it was spent on these)', () => {
        const room = aRoom().withRcl(3).withSpawn(30, 18, { hits: 5000, hitsMax: 5000 })
            .withHostile(32, 20, harasser).withHostile(33, 21, harasser).withHostile(31, 21, harasser).build();
        expect(decideSafeMode(room)).toEqual([]);
    });

    test('no safe mode for a single dismantler the tower kills first', () => {
        const room = aRoom().withRcl(5).withSpawn(30, 18, { hits: 5000, hitsMax: 5000 }).withTower(28, 18, { hits: 3000, hitsMax: 3000 })
            .withHostile(30, 20, dismantler).build();
        expect(decideSafeMode(room)).toEqual([]);
    });

    function finalWave(rampartHits?: number) {
        let room = aRoom().withRcl(5).withSpawn(30, 18, { hits: 5000, hitsMax: 5000 }).withTower(28, 18, { energy: 820, hits: 3000, hitsMax: 3000 });
        if (rampartHits !== undefined) {
            room = room.withStructure(STRUCTURE_RAMPART, 28, 18, { hits: rampartHits, hitsMax: 1e7 });
        }
        // West of the tower: within 3 of it, out of reach of the spawn (2 tiles east of the tower).
        // 14 tiles fit, so the 15th shares one.
        for (let i = 0; i < 15; i++) {
            room = room.withHostile(25 + (i % 2), 15 + (Math.floor(i / 2) % 7), dismantler);
        }
        return room.build();
    }

    test('safe mode for the final wave: 15 dismantlers on the unprotected tower', () => {
        expect(assessBaseThreat(finalWave())).toBe(
            '15 hostiles (Cyborger) can destroy the tower at 28,18 in ~1 ticks; towers need ~60 ticks to kill them');
    });

    test('a strong enough rampart over the tower lets it win without safe mode', () => {
        // 15 dismantlers do 4,500 a tick; the tower needs ~60 ticks to kill them all. Behind 300k
        // they need ~67 ticks, behind 100k only ~23.
        expect(assessBaseThreat(finalWave(300000))).toBeNull();
        expect(assessBaseThreat(finalWave(100000))).toContain('can destroy the tower');
    });
});

describe('damage estimates', () => {
    test('structure damage counts attack, ranged attack and dismantle', () => {
        expect(structureDamagePerTick({ activeParts: { [ATTACK]: 2, [RANGED_ATTACK]: 3, [WORK]: 4, [HEAL]: 5 } } as HostileCreepSnapshot))
            .toBe(2 * 30 + 3 * 10 + 4 * 50);
    });

    test('tower damage falls from 600 within range 5 to 150 at range 20', () => {
        expect([1, 5, 10, 20, 30].map(towerDamageAt)).toEqual([600, 600, 450, 150, 150]);
    });

    test('the horizon is short enough that slow chip damage never spends safe mode', () => {
        expect(BREAK_HORIZON_TICKS).toBeLessThanOrEqual(100);
    });
});
