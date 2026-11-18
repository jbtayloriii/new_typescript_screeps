import { describe, expect, test } from '@jest/globals';
import { decideTowerIntents, TOWER_REPAIR_HITS_CUTOFF } from './tower_logic';
import { aRoom } from 'testing/builders/room_snapshot_builder';

describe('decideTowerIntents', () => {
    test('does nothing in a quiet, undamaged room', () => {
        const room = aRoom().withTower(25, 25).withStructure(STRUCTURE_ROAD, 26, 26, { owner: 'none' }).build();
        expect(decideTowerIntents(room)).toEqual([]);
    });

    test('attacks the closest hostile', () => {
        const room = aRoom().withTower(25, 25).withHostile(40, 40).withHostile(30, 30).build();
        const [tower] = room.structures;
        const closeHostile = room.hostileCreeps[1];

        expect(decideTowerIntents(room)).toEqual([
            { kind: 'towerAttack', towerId: tower.id, targetId: closeHostile.id },
        ]);
    });

    test('attacking takes priority over repairing', () => {
        const room = aRoom()
            .withTower(25, 25)
            .withStructure(STRUCTURE_ROAD, 26, 26, { hits: 100, hitsMax: 5000, owner: 'none' })
            .withHostile(40, 40)
            .build();
        expect(decideTowerIntents(room).map(i => i.kind)).toEqual(['towerAttack']);
    });

    test('repairs the closest sufficiently damaged structure', () => {
        const room = aRoom()
            .withTower(25, 25)
            .withStructure(STRUCTURE_ROAD, 40, 40, { hits: 100, hitsMax: 5000, owner: 'none' })
            .withStructure(STRUCTURE_CONTAINER, 27, 27, { hits: 1000, hitsMax: 250000, owner: 'none' })
            .build();
        const container = room.structures[2];

        expect(decideTowerIntents(room)).toEqual([
            { kind: 'towerRepair', towerId: room.structures[0].id, targetId: container.id },
        ]);
    });

    test('skips slightly damaged, high-hit and enemy structures', () => {
        const room = aRoom()
            .withTower(25, 25)
            // Missing less than the minimum damage
            .withStructure(STRUCTURE_ROAD, 26, 26, { hits: 4500, hitsMax: 5000, owner: 'none' })
            // Above the cutoff (e.g. walls)
            .withStructure(STRUCTURE_WALL, 27, 27, { hits: TOWER_REPAIR_HITS_CUTOFF + 1, hitsMax: 300000000, owner: 'none' })
            // Owned by someone else
            .withStructure(STRUCTURE_EXTENSION, 28, 28, { hits: 100, hitsMax: 1000, owner: 'other' })
            .build();
        expect(decideTowerIntents(room)).toEqual([]);
    });

    test('skips towers without enough energy to act', () => {
        const room = aRoom().withTower(25, 25, { energy: TOWER_ENERGY_COST - 1 }).withHostile(30, 30).build();
        expect(decideTowerIntents(room)).toEqual([]);
    });

    test('ignores towers owned by others', () => {
        const room = aRoom().withTower(25, 25, { owner: 'other' }).withHostile(30, 30).build();
        expect(decideTowerIntents(room)).toEqual([]);
    });

    test('decides for each tower independently', () => {
        const room = aRoom().withTower(10, 10).withTower(40, 40).withHostile(12, 12).withHostile(38, 38).build();
        const [t1, t2] = room.structures;
        const [h1, h2] = room.hostileCreeps;

        expect(decideTowerIntents(room)).toEqual([
            { kind: 'towerAttack', towerId: t1.id, targetId: h1.id },
            { kind: 'towerAttack', towerId: t2.id, targetId: h2.id },
        ]);
    });
});
