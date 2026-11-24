import { describe, expect, test } from '@jest/globals';
import { groupCreepsByBase, tickEachBase } from './headquarters';
import { aRoom } from 'testing/builders/room_snapshot_builder';

describe('groupCreepsByBase', () => {
    const creep = (name: string, roomName: string, baseRoomName: string) =>
        aRoom(roomName).withMyCreep(name, 10, 10, { memory: { taskName: 't', baseRoomName } }).build().creepsPresent[0];

    test('groups creeps by their base, wherever they are', () => {
        const remote = creep('remote', 'W2N2', 'W1N1');
        const { byBase, rehomed } = groupCreepsByBase([remote, creep('home', 'W1N1', 'W1N1')], ['W1N1', 'W3N3']);

        expect(byBase.get('W1N1')!.map(c => c.name)).toEqual(['remote', 'home']);
        expect(byBase.get('W3N3')).toEqual([]);
        expect(rehomed).toEqual([]);
    });

    test('rehomes creeps of unknown bases to the base they are in, else the first base', () => {
        const { byBase, rehomed } = groupCreepsByBase(
            [creep('inW3', 'W3N3', ''), creep('lost', 'W9N9', 'W8N8')], ['W1N1', 'W3N3']);

        expect(rehomed.map(r => [r.creep.name, r.baseRoomName])).toEqual([['inW3', 'W3N3'], ['lost', 'W1N1']]);
        expect(byBase.get('W3N3')![0].memory.baseRoomName).toBe('W3N3');
    });

    test('ignores creeps when there are no bases', () => {
        expect(groupCreepsByBase([creep('c', 'W1N1', 'W1N1')], []).rehomed).toEqual([]);
    });
});

describe('tickEachBase', () => {
    test('a base that throws does not stop the bases after it', () => {
        const ticked: string[] = [];
        const logs: string[] = [];
        const bases = new Map([['W1N1', 'a'], ['W2N2', 'b'], ['W3N3', 'c']]);
        const failed = tickEachBase(bases, (base, room) => {
            if (room === 'W2N2') throw new Error('boom');
            ticked.push(base);
        }, m => logs.push(m));

        expect(ticked).toEqual(['a', 'c']);
        expect(failed).toEqual(['W2N2']);
        expect(logs[0]).toMatch(/^\[W2N2\] base tick failed: Error: boom/);
    });
});
