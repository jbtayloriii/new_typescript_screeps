import { describe, expect, test } from '@jest/globals';
import { mockInstanceOf, mockStructure } from 'screeps-jest';
import { buildRoomSnapshot, countOpenSpots } from './build_snapshot';

const pos = (x: number, y: number) => ({ x, y, roomName: 'W1N1' });
const store = (energy: number, capacity: number) => ({ [RESOURCE_ENERGY]: energy, getCapacity: () => capacity, getFreeCapacity: () => capacity - energy });

function mockRoom(found: { [findType: number]: unknown[] }, controller?: StructureController): Room {
    return mockInstanceOf<Room>({
        name: 'W1N1',
        energyAvailable: 250,
        energyCapacityAvailable: 300,
        controller,
        find: ((type: number) => found[type] ?? []) as Room['find'],
        // A wall column at x = 4, next to the test source at (5, 5)
        getTerrain: () => ({ get: (x: number) => x === 4 ? TERRAIN_MASK_WALL : 0 }),
    });
}

describe('buildRoomSnapshot', () => {
    test('copies room-level fields and the controller', () => {
        const controller = mockStructure(STRUCTURE_CONTROLLER, {
            id: 'ctrl' as Id<StructureController>,
            pos: pos(20, 20),
            my: true, level: 3, progress: 10, progressTotal: 100, ticksToDowngrade: 5000,
            owner: { username: 'me' }, reservation: undefined,
            safeMode: undefined, safeModeAvailable: 2, safeModeCooldown: 100,
        });
        const snapshot = buildRoomSnapshot(mockRoom({ [FIND_STRUCTURES]: [controller] }, controller), 42);

        expect(snapshot.name).toBe('W1N1');
        expect(snapshot.tick).toBe(42);
        expect(snapshot.energyAvailable).toBe(250);
        expect(snapshot.energyCapacityAvailable).toBe(300);
        expect(snapshot.controller).toEqual({
            id: 'ctrl', pos: pos(20, 20), my: true, level: 3, progress: 10, progressTotal: 100, ticksToDowngrade: 5000,
            owner: 'me', reservation: undefined, safeMode: undefined, safeModeAvailable: 2, safeModeCooldown: 100,
        });
        // The controller is not duplicated in structures
        expect(snapshot.structures).toEqual([]);
    });

    test('has a null controller in rooms without one', () => {
        expect(buildRoomSnapshot(mockRoom({}), 1).controller).toBeNull();
    });

    test('maps structures with ownership, stores and spawning state', () => {
        const spawn = mockStructure(STRUCTURE_SPAWN, {
            id: 'spawn' as Id<StructureSpawn>, pos: pos(10, 10), hits: 5000, hitsMax: 5000,
            my: true, store: store(200, 300), spawning: null,
        });
        const enemyTower = mockStructure(STRUCTURE_TOWER, {
            id: 'tower' as Id<StructureTower>, pos: pos(11, 11), hits: 3000, hitsMax: 3000,
            my: false, store: store(0, 1000),
        });
        const road = mockStructure(STRUCTURE_ROAD, {
            id: 'road' as Id<StructureRoad>, pos: pos(12, 12), hits: 100, hitsMax: 5000,
        });

        const snapshot = buildRoomSnapshot(mockRoom({ [FIND_STRUCTURES]: [spawn, enemyTower, road] }), 1);

        expect(snapshot.structures).toEqual([
            { id: 'spawn', structureType: STRUCTURE_SPAWN, pos: pos(10, 10), hits: 5000, hitsMax: 5000, owner: 'me', store: { energy: 200, energyCapacity: 300, freeCapacity: 100 }, spawning: false },
            { id: 'tower', structureType: STRUCTURE_TOWER, pos: pos(11, 11), hits: 3000, hitsMax: 3000, owner: 'other', store: { energy: 0, energyCapacity: 1000, freeCapacity: 1000 } },
            { id: 'road', structureType: STRUCTURE_ROAD, pos: pos(12, 12), hits: 100, hitsMax: 5000, owner: 'none' },
        ]);
    });

    test('maps sources and construction sites', () => {
        const source = mockInstanceOf<Source>({ id: 'src' as Id<Source>, pos: pos(5, 5), energy: 1000, energyCapacity: 3000 });
        const site = mockInstanceOf<ConstructionSite>({
            id: 'site' as Id<ConstructionSite>, structureType: STRUCTURE_EXTENSION, pos: pos(6, 6), progress: 5, progressTotal: 3000,
        });

        const snapshot = buildRoomSnapshot(mockRoom({ [FIND_SOURCES]: [source], [FIND_MY_CONSTRUCTION_SITES]: [site] }), 1);

        expect(snapshot.sources).toEqual([{ id: 'src', pos: pos(5, 5), energy: 1000, energyCapacity: 3000, openSpots: 5 }]);
        expect(snapshot.constructionSites).toEqual([
            { id: 'site', structureType: STRUCTURE_EXTENSION, pos: pos(6, 6), progress: 5, progressTotal: 3000 },
        ]);
    });

    test('maps creeps, counting only active body parts', () => {
        const memory = { taskName: 'W1N1_1_0' } as CreepMemory;
        const mine = mockInstanceOf<Creep>({
            id: 'mine' as Id<Creep>, name: 'Harvester1', pos: pos(7, 7), hits: 300, hitsMax: 300,
            body: [{ type: WORK, hits: 100 }, { type: WORK, hits: 0 }, { type: CARRY, hits: 100 }, { type: MOVE, hits: 100 }],
            store: store(25, 50), spawning: false, ticksToLive: 1200, memory,
        });
        const hostile = mockInstanceOf<Creep>({
            id: 'bad' as Id<Creep>, name: 'Invader1', pos: pos(8, 8), hits: 100, hitsMax: 200,
            body: [{ type: ATTACK, hits: 100 }], store: store(0, 0), spawning: false, ticksToLive: 500,
            owner: { username: 'Invader' },
        });

        const snapshot = buildRoomSnapshot(mockRoom({ [FIND_MY_CREEPS]: [mine], [FIND_HOSTILE_CREEPS]: [hostile] }), 1);

        expect(snapshot.creepsPresent).toEqual([{
            id: 'mine', name: 'Harvester1', pos: pos(7, 7), hits: 300, hitsMax: 300,
            activeParts: { [WORK]: 1, [CARRY]: 1, [MOVE]: 1 },
            store: { energy: 25, energyCapacity: 50, freeCapacity: 25 }, spawning: false, ticksToLive: 1200, memory,
        }]);
        expect(snapshot.hostileCreeps).toEqual([{
            id: 'bad', name: 'Invader1', pos: pos(8, 8), hits: 100, hitsMax: 200,
            activeParts: { [ATTACK]: 1 },
            store: { energy: 0, energyCapacity: 0, freeCapacity: 0 }, spawning: false, ticksToLive: 500, owner: 'Invader',
        }]);
    });

    test('maps ruins with their energy', () => {
        const ruin = mockInstanceOf<Ruin>({ id: 'ruin' as Id<Ruin>, pos: pos(9, 9), store: { [RESOURCE_ENERGY]: 75 } });
        const snapshot = buildRoomSnapshot(mockRoom({ [FIND_RUINS]: [ruin] }), 1);
        expect(snapshot.ruins).toEqual([{ id: 'ruin', pos: pos(9, 9), energy: 75 }]);
    });

    test('copies reservations and dropped resources', () => {
        const controller = mockStructure(STRUCTURE_CONTROLLER, {
            id: 'ctrl' as Id<StructureController>, pos: pos(20, 20), my: false, level: 0, progress: 0, progressTotal: 0,
            ticksToDowngrade: 0, owner: undefined, reservation: { username: 'them', ticksToEnd: 1234 },
            safeMode: undefined, safeModeAvailable: 0, safeModeCooldown: undefined,
        });
        const drop = mockInstanceOf<Resource>({ id: 'drop' as Id<Resource>, pos: pos(3, 3), resourceType: RESOURCE_ENERGY, amount: 120 });
        const snapshot = buildRoomSnapshot(mockRoom({ [FIND_DROPPED_RESOURCES]: [drop] }, controller), 1);

        expect(snapshot.controller).toMatchObject({ owner: undefined, reservation: { username: 'them', ticksToEnd: 1234 } });
        expect(snapshot.droppedResources).toEqual([{ id: 'drop', pos: pos(3, 3), resourceType: RESOURCE_ENERGY, amount: 120 }]);
    });

    test('produces JSON-safe data', () => {
        const source = mockInstanceOf<Source>({ id: 'src' as Id<Source>, pos: pos(5, 5), energy: 1000, energyCapacity: 3000 });
        const snapshot = buildRoomSnapshot(mockRoom({ [FIND_SOURCES]: [source] }), 1);
        expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    });

    test('countOpenSpots skips walls, the center and tiles outside the room', () => {
        expect(countOpenSpots({ x: 10, y: 10 }, () => false)).toBe(8);
        expect(countOpenSpots({ x: 0, y: 0 }, () => false)).toBe(3);
        expect(countOpenSpots({ x: 10, y: 10 }, (x, y) => !(x === 11 && y === 11))).toBe(1);
    });
});

