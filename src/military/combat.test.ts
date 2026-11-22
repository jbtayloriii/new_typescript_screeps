import { describe, expect, test } from '@jest/globals';
import { chooseHealTarget, chooseTarget, decideCombat, hasHostileCombatCreeps } from './combat';
import { aRoom } from 'testing/builders/room_snapshot_builder';

const at = (x: number, y: number) => ({ x, y, roomName: 'W1N1' });

describe('chooseTarget', () => {
    test('healers first, then ranged, then melee, then others; closest within a tier', () => {
        const room = aRoom()
            .withHostile(11, 11, { activeParts: { [MOVE]: 1 } })
            .withHostile(12, 12, { activeParts: { [ATTACK]: 1 } })
            .withHostile(30, 30, { activeParts: { [RANGED_ATTACK]: 1 } })
            .withHostile(40, 40, { activeParts: { [HEAL]: 1 } })
            .withHostile(45, 45, { activeParts: { [HEAL]: 1 } })
            .build();
        expect(chooseTarget(at(10, 10), room, 'none')?.id).toBe(room.hostileCreeps[3].id);
        const noHealers = { ...room, hostileCreeps: room.hostileCreeps.slice(0, 3) };
        expect(chooseTarget(at(10, 10), noHealers, 'none')?.id).toBe(room.hostileCreeps[2].id);
    });

    test('ignores Source Keepers', () => {
        const room = aRoom().withHostile(11, 11, { owner: 'Source Keeper' }).build();
        expect(chooseTarget(at(10, 10), room, 'all')).toBeNull();
    });

    test('structures by tier, and only what the mission allows', () => {
        const room = aRoom()
            .withStructure(STRUCTURE_EXTENSION, 11, 11, { owner: 'other' })
            .withStructure(STRUCTURE_SPAWN, 20, 20, { owner: 'other' })
            .withStructure(STRUCTURE_INVADER_CORE, 40, 40, { owner: 'other' })
            .withStructure(STRUCTURE_RAMPART, 12, 12, { owner: 'other' })
            .build();
        const [extension, , core] = room.structures;
        expect(chooseTarget(at(10, 10), room, 'all')).toEqual({ id: core.id, pos: core.pos, kind: 'structure' });
        expect(chooseTarget(at(10, 10), room, 'invaderCores')?.id).toBe(core.id);
        expect(chooseTarget(at(10, 10), room, 'none')).toBeNull();
        const noCore = { ...room, structures: room.structures.filter(s => s.structureType !== STRUCTURE_INVADER_CORE) };
        expect(chooseTarget(at(10, 10), noCore, 'all')?.id).toBe(noCore.structures[1].id);
        expect(chooseTarget(at(10, 10), noCore, 'invaderCores')).toBeNull();
        expect(extension).toBeDefined();
    });
});

describe('chooseHealTarget', () => {
    test('the most damaged member in the same room', () => {
        const room = aRoom().withMyCreep('a', 1, 1, { hits: 200, hitsMax: 300 }).withMyCreep('b', 2, 2, { hits: 50, hitsMax: 300 })
            .withMyCreep('c', 3, 3).build();
        const [a, b, c] = room.creepsPresent;
        expect(chooseHealTarget(c, room.creepsPresent)?.name).toBe('b');
        expect(chooseHealTarget(c, [c])).toBeNull();
        expect(a).toBeDefined();
    });
});

describe('decideCombat', () => {
    const room = aRoom().withHostile(15, 10, { activeParts: { [ATTACK]: 1 } }).withMyCreep('me', 10, 10).build();
    const target = chooseTarget(at(10, 10), room, 'none');
    const me = room.creepsPresent[0];

    test('melee closes in, then attacks', () => {
        expect(decideCombat(me, 'melee', target, room, [me], null)).toEqual([
            { kind: 'move', creepName: 'me', target: at(15, 10), range: 1 },
        ]);
        const adjacent = { ...me, pos: at(14, 10) };
        expect(decideCombat(adjacent, 'melee', target, room, [adjacent], null)).toEqual([
            { kind: 'attack', creepName: 'me', targetId: target!.id },
        ]);
    });

    test('ranged keeps range 3, and mass attacks when crowded', () => {
        expect(decideCombat(me, 'ranged', target, room, [me], null)).toEqual([
            { kind: 'move', creepName: 'me', target: at(15, 10), range: 3 },
        ]);
        const inRange = { ...me, pos: at(12, 10) };
        expect(decideCombat(inRange, 'ranged', target, room, [inRange], null)).toEqual([
            { kind: 'rangedAttack', creepName: 'me', targetId: target!.id },
        ]);
        const crowded = aRoom().withHostile(11, 10).withHostile(12, 12).withMyCreep('me', 10, 10).build();
        expect(decideCombat(crowded.creepsPresent[0], 'ranged', chooseTarget(at(10, 10), crowded, 'none'), crowded, [], null))
            .toEqual([{ kind: 'rangedMassAttack', creepName: 'me' }]);
    });

    test('healers heal the most damaged member (ranged heal from afar), else follow', () => {
        const squad = aRoom().withMyCreep('healer', 10, 10).withMyCreep('hurt', 12, 10, { hits: 100, hitsMax: 300 }).build();
        const [healer] = squad.creepsPresent;
        expect(decideCombat(healer, 'healer', null, squad, squad.creepsPresent, null)).toEqual([
            { kind: 'rangedHeal', creepName: 'healer', targetId: squad.creepsPresent[1].id },
            { kind: 'move', creepName: 'healer', target: at(12, 10), range: 1 },
        ]);
        const healthy = aRoom().withMyCreep('healer', 10, 10).build();
        expect(decideCombat(healthy.creepsPresent[0], 'healer', null, healthy, healthy.creepsPresent, at(20, 20))).toEqual([
            { kind: 'move', creepName: 'healer', target: at(20, 20), range: 1 },
        ]);
    });

    test('hasHostileCombatCreeps ignores harmless and Source Keeper creeps', () => {
        expect(hasHostileCombatCreeps(room)).toBe(true);
        expect(hasHostileCombatCreeps(aRoom().withHostile(1, 1, { activeParts: { [MOVE]: 1 } }).build())).toBe(false);
        expect(hasHostileCombatCreeps(aRoom().withHostile(1, 1, { owner: 'Source Keeper' }).build())).toBe(false);
    });
});
