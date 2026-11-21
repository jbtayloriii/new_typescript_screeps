import { describe, expect, test } from '@jest/globals';
import { decideSafeMode } from './safe_mode';
import { aRoom } from 'testing/builders/room_snapshot_builder';

const attacker = { activeParts: { [ATTACK]: 5, [MOVE]: 5 }, owner: 'enemy' };

describe('decideSafeMode', () => {
    test('activates when attackers reach the spawn and there are no towers', () => {
        const room = aRoom().withRcl(3).withSpawn(10, 10).withHostile(12, 12, attacker).build();
        expect(decideSafeMode(room)).toEqual([{ kind: 'activateSafeMode', controllerId: room.controller!.id }]);
    });

    test('lets towers handle it while they can, unless a spawn is damaged', () => {
        const coping = aRoom().withRcl(3).withSpawn(10, 10).withTower(15, 15).withHostile(12, 12, attacker).build();
        expect(decideSafeMode(coping)).toEqual([]);

        const hurt = aRoom().withRcl(3).withSpawn(10, 10, { hits: 4000, hitsMax: 5000 }).withTower(15, 15).withHostile(12, 12, attacker).build();
        expect(decideSafeMode(hurt)).toHaveLength(1);
    });

    test('activates when healers out-heal the towers', () => {
        const healers = aRoom().withRcl(3).withSpawn(10, 10).withTower(15, 15)
            .withHostile(12, 12, { activeParts: { [ATTACK]: 1, [HEAL]: 20 }, owner: 'enemy' }).build();
        expect(decideSafeMode(healers)).toHaveLength(1);
    });

    test('ignores far-away or harmless hostiles, and respects availability and cooldown', () => {
        expect(decideSafeMode(aRoom().withRcl(3).withSpawn(10, 10).withHostile(40, 40, attacker).build())).toEqual([]);
        expect(decideSafeMode(aRoom().withRcl(3).withSpawn(10, 10).withHostile(12, 12, { activeParts: { [MOVE]: 1 } }).build())).toEqual([]);
        expect(decideSafeMode(aRoom().withRcl(3, { safeModeAvailable: 0 }).withSpawn(10, 10).withHostile(12, 12, attacker).build())).toEqual([]);
        expect(decideSafeMode(aRoom().withRcl(3, { safeModeCooldown: 100 }).withSpawn(10, 10).withHostile(12, 12, attacker).build())).toEqual([]);
        expect(decideSafeMode(aRoom().withRcl(3, { safeMode: 500 }).withSpawn(10, 10).withHostile(12, 12, attacker).build())).toEqual([]);
    });

    test('also protects the controller from claimers', () => {
        const room = aRoom().withRcl(3).withHostile(24, 24, { activeParts: { [CLAIM]: 1, [MOVE]: 1 }, owner: 'enemy' }).build();
        expect(decideSafeMode(room)).toHaveLength(1);
    });
});
