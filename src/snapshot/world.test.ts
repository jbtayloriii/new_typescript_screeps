import { describe, expect, test } from '@jest/globals';
import { mockInstanceOf } from 'screeps-jest';
import { createWorldSnapshot } from './world';

function mockRoom(name: string): Room {
    return mockInstanceOf<Room>({
        name, energyAvailable: 0, energyCapacityAvailable: 0, controller: undefined, find: () => [],
    });
}

describe('createWorldSnapshot', () => {
    test('builds visible rooms on request, once per tick', () => {
        const room = mockRoom('W1N1');
        const world = createWorldSnapshot({ time: 5, rooms: { W1N1: room }, creeps: {} } as unknown as Game);

        const first = world.getRoom('W1N1');
        expect(first?.name).toBe('W1N1');
        expect(world.getRoom('W1N1')).toBe(first);
        expect(room.find).toHaveBeenCalledTimes(6); // one call per find type, only once
        expect(world.getRoom('W9N9')).toBeUndefined();
        expect(world.tick).toBe(5);
    });

    test('lists all my creeps, including ones in other rooms', () => {
        const creep = mockInstanceOf<Creep>({
            id: 'c' as Id<Creep>, name: 'c', pos: { x: 1, y: 1, roomName: 'W5N5' }, hits: 1, hitsMax: 1, body: [],
            store: { [RESOURCE_ENERGY]: 0, getCapacity: () => 0, getFreeCapacity: () => 0 },
            spawning: false, ticksToLive: 10, memory: { taskName: 't', baseRoomName: 'W1N1' },
        });
        const world = createWorldSnapshot({ time: 1, rooms: {}, creeps: { c: creep } } as unknown as Game);
        expect(world.myCreeps.map(c => [c.name, c.pos.roomName])).toEqual([['c', 'W5N5']]);
    });
});
