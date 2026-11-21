import { describe, expect, test } from '@jest/globals';
import { INTEL_STALE_TICKS, scoutTask, staleNeighbors } from './scout_task';
import { aRoom } from 'testing/builders/room_snapshot_builder';
import { aTaskContext } from 'testing/builders/context';
import { worldOf } from 'testing/builders/world';
import { RoomIntel } from 'intel/types';
import { RoomSnapshot } from 'snapshot/types';

const task = { name: 's', roomName: 'W1N1', type: 'scout' as const };
const seenAt = (lastSeen: number): RoomIntel => ({ lastSeen, sources: [], keeperLairs: 0, hostileCombatCreeps: 0 });
const scout = (pos: { x: number, y: number, roomName?: string }, targetRoom?: string) => ({
    memory: { taskName: 's', baseRoomName: 'W1N1', targetRoom }, pos: { roomName: 'W1N1', ...pos },
});

function ctx(home: RoomSnapshot, intel: Record<string, RoomIntel>) {
    return aTaskContext(home, { world: worldOf([home], { exits: { W1N1: ['W1N2', 'W2N1', 'W0N1'] } }), intel });
}

describe('staleNeighbors', () => {
    test('lists missing intel first, then the oldest, skipping fresh rooms', () => {
        const home = aRoom().withTick(INTEL_STALE_TICKS + 100).build();
        expect(staleNeighbors(ctx(home, { W1N2: seenAt(1), W0N1: seenAt(home.tick - 10) }))).toEqual(['W2N1', 'W1N2']);
    });
});

describe('scoutTask', () => {
    test('spawns one scout only while a neighbor is stale', () => {
        const home = aRoom().withTick(10).build();
        expect(scoutTask.getSpawnRequests(task, ctx(home, {}))).toHaveLength(1);
        const fresh = { W1N2: seenAt(5), W2N1: seenAt(5), W0N1: seenAt(5) };
        expect(scoutTask.getSpawnRequests(task, ctx(home, fresh))).toEqual([]);
    });

    test('heads to the stalest neighbor and remembers it', () => {
        const home = aRoom().withTick(10).withMyCreep('scout', 25, 25, scout({ x: 25, y: 25 })).build();
        expect(scoutTask.decide(task, ctx(home, { W1N2: seenAt(1), W0N1: seenAt(2) }))).toEqual([
            { kind: 'move', creepName: 'scout', target: { x: 25, y: 25, roomName: 'W2N1' }, range: 20 },
            { kind: 'setCreepMemory', creepName: 'scout', patch: { targetRoom: 'W2N1' } },
        ]);
    });

    test('moves on once its target has been seen, and goes home when nothing is stale', () => {
        const home = aRoom().withTick(10).withMyCreep('scout', 25, 25, scout({ x: 25, y: 25, roomName: 'W2N1' }, 'W2N1')).build();
        const intents = scoutTask.decide(task, ctx(home, { W2N1: seenAt(10), W0N1: seenAt(10) }));
        expect(intents).toContainEqual({ kind: 'setCreepMemory', creepName: 'scout', patch: { targetRoom: 'W1N2' } });

        const allFresh = { W1N2: seenAt(10), W2N1: seenAt(10), W0N1: seenAt(10) };
        expect(scoutTask.decide(task, ctx(home, allFresh))).toEqual([
            { kind: 'move', creepName: 'scout', target: { x: 25, y: 25, roomName: 'W1N1' }, range: 20 },
            { kind: 'setCreepMemory', creepName: 'scout', patch: { targetRoom: undefined } },
        ]);
    });
});
