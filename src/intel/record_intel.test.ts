import { describe, expect, test } from '@jest/globals';
import { INTEL_UPDATE_INTERVAL, recordIntel, roomsNeedingIntel } from './record_intel';
import { aRoom } from 'testing/builders/room_snapshot_builder';
import { worldOf } from 'testing/builders/world';

describe('recordIntel', () => {
    test('records sources, controller, keeper lairs and combat hostiles', () => {
        const room = aRoom('W1N2').withTick(500)
            .withRcl(0, { owner: undefined, my: false, reservation: { username: 'them', ticksToEnd: 1000 } })
            .withSource(10, 11)
            .withStructure(STRUCTURE_KEEPER_LAIR, 5, 5, { owner: 'other' })
            .withHostile(30, 30)
            .withHostile(31, 31, { activeParts: { [MOVE]: 1 } })
            .build();

        expect(recordIntel(room, undefined)).toEqual({
            lastSeen: 500,
            sources: [{ id: room.sources[0].id, x: 10, y: 11 }],
            controller: { x: 25, y: 25, level: 0, owner: undefined, reservedBy: 'them', reservationEnd: 1500 },
            keeperLairs: 1,
            invaderCores: 0,
            // Keeper lairs aren't structures an attack has to clear
            hostileStructures: 0,
            hostileOwners: ['Invader'],
            hostileCombatCreeps: 1,
            hostilesLastSeen: 500,
        });
    });

    test('keeps when hostiles were last seen after they leave', () => {
        const quiet = aRoom('W1N2').withTick(900).build();
        const previous = recordIntel(aRoom('W1N2').withTick(500).withHostile(1, 1).build(), undefined);
        expect(recordIntel(quiet, previous)).toMatchObject({ hostileCombatCreeps: 0, hostilesLastSeen: 500, controller: undefined });
    });
});

describe('roomsNeedingIntel', () => {
    test('visible rooms with missing or outdated intel', () => {
        const tick = 1000;
        const world = worldOf([aRoom('A').withTick(tick).build(), aRoom('B').withTick(tick).build(), aRoom('C').withTick(tick).build()]);
        const entry = (lastSeen: number) => ({ lastSeen, sources: [], keeperLairs: 0, hostileCombatCreeps: 0 });
        expect(roomsNeedingIntel(world, { B: entry(tick - INTEL_UPDATE_INTERVAL), C: entry(tick - 1) })).toEqual(['A', 'B']);
    });
});

describe('recordIntel: military fields', () => {
    test('counts Invader cores and attackable hostile structures', () => {
        const room = aRoom('W1N2').withTick(5)
            .withStructure(STRUCTURE_INVADER_CORE, 10, 10, { owner: 'other' })
            .withStructure(STRUCTURE_TOWER, 11, 11, { owner: 'other' })
            .withStructure(STRUCTURE_RAMPART, 12, 12, { owner: 'other' })
            .withStructure(STRUCTURE_ROAD, 13, 13, { owner: 'none' })
            .withHostile(30, 30, { owner: 'someone' })
            .build();
        expect(recordIntel(room, undefined)).toMatchObject({ invaderCores: 1, hostileStructures: 2, hostileOwners: ['someone'] });
    });
});

