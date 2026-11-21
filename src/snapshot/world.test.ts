import { describe, expect, test } from '@jest/globals';
import { mockInstanceOf } from 'screeps-jest';
import { createWorldSnapshot } from './world';

function mockRoom(name: string): Room {
    return mockInstanceOf<Room>({
        name, energyAvailable: 0, energyCapacityAvailable: 0, controller: undefined, find: () => [],
        getTerrain: () => ({ get: () => 0 }),
    });
}

function mockGame(game: Partial<Record<keyof Game, unknown>>): Game {
    return {
        rooms: {}, creeps: {}, spawns: {}, flags: {}, gcl: { level: 1 },
        map: {
            describeExits: (room: string) => room === 'W1N1' ? { 1: 'W1N2', 3: 'W0N1' } : null,
            getRoomTerrain: () => ({ get: (x: number) => x === 0 ? TERRAIN_MASK_WALL : 0 }),
        },
        ...game,
    } as unknown as Game;
}

describe('createWorldSnapshot', () => {
    test('exposes visible rooms, exits and my username', () => {
        const spawn = { owner: { username: 'me' } };
        const world = createWorldSnapshot(mockGame({ time: 1, rooms: { W1N1: mockRoom('W1N1') }, spawns: { Spawn1: spawn } }));

        expect(world.visibleRooms).toEqual(['W1N1']);
        expect(world.getExits('W1N1')).toEqual(['W1N2', 'W0N1']);
        expect(world.getExits('W9N9')).toEqual([]);
        expect(world.myUsername).toBe('me');
    });

    test('builds visible rooms on request, once per tick', () => {
        const room = mockRoom('W1N1');
        const world = createWorldSnapshot(mockGame({ time: 5, rooms: { W1N1: room } }));

        const first = world.getRoom('W1N1');
        expect(first?.name).toBe('W1N1');
        expect(world.getRoom('W1N1')).toBe(first);
        expect(room.find).toHaveBeenCalledTimes(7); // one call per find type, only once
        expect(world.getRoom('W9N9')).toBeUndefined();
        expect(world.tick).toBe(5);
    });

    test('lists all my creeps, including ones in other rooms', () => {
        const creep = mockInstanceOf<Creep>({
            id: 'c' as Id<Creep>, name: 'c', pos: { x: 1, y: 1, roomName: 'W5N5' }, hits: 1, hitsMax: 1, body: [],
            store: { [RESOURCE_ENERGY]: 0, getCapacity: () => 0, getFreeCapacity: () => 0 },
            spawning: false, ticksToLive: 10, memory: { taskName: 't', baseRoomName: 'W1N1' },
        });
        const world = createWorldSnapshot(mockGame({ time: 1, creeps: { c: creep } }));
        expect(world.myCreeps.map(c => [c.name, c.pos.roomName])).toEqual([['c', 'W5N5']]);
    });

    test('exposes flags, GCL, owned rooms and terrain', () => {
        const flag = { name: 'f1', color: COLOR_YELLOW, secondaryColor: COLOR_WHITE, pos: { x: 3, y: 4, roomName: 'W1N2' } };
        const owned = mockInstanceOf<Room>({ name: 'W1N1', controller: { my: true } });
        const world = createWorldSnapshot(mockGame({ time: 1, rooms: { W1N1: owned }, flags: { f1: flag }, gcl: { level: 2 } }));

        expect(world.flags).toEqual([{ name: 'f1', color: COLOR_YELLOW, secondaryColor: COLOR_WHITE, pos: { x: 3, y: 4, roomName: 'W1N2' } }]);
        expect(world.gclLevel).toBe(2);
        expect(world.ownedRooms).toEqual(['W1N1']);
        expect(world.getTerrain('W5N5').isWall(0, 10)).toBe(true);
        expect(world.getTerrain('W5N5').isWall(1, 10)).toBe(false);
    });
});

