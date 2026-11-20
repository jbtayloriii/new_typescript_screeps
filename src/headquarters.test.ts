import { describe, expect, test } from '@jest/globals';
import { groupCreepsByBase } from './headquarters';
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
