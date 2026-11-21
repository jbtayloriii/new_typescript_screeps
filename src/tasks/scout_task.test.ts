import { describe, expect, test } from '@jest/globals';
import { INTEL_STALE_TICKS, roomsWithinExits, scoutTask, staleNeighbors } from './scout_task';
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

describe('scoutTask with a target room (scout directive)', () => {
    const directed = { name: 'ds', roomName: 'W1N1', type: 'scout' as const, targetRoom: 'W9N9', directiveId: 'd1' };
    const directive = { id: 'd1', type: 'scout' as const, targetRoom: 'W9N9', source: 'manual' as const, status: 'active' as const, createdAt: 50 };
    const withDirective = (home: RoomSnapshot, intel: Record<string, RoomIntel>) =>
        aTaskContext(home, { intel, directives: { d1: directive } });

    test('spawns until the room is seen after the directive was created', () => {
        const home = aRoom().withTick(100).build();
        expect(scoutTask.getSpawnRequests(directed, withDirective(home, { W9N9: seenAt(40) }))).toHaveLength(1);
        expect(scoutTask.getSpawnRequests(directed, withDirective(home, { W9N9: seenAt(60) }))).toEqual([]);
    });

    test('heads straight for the target room', () => {
        const home = aRoom().withTick(100).withMyCreep('s1', 25, 25, scout({ x: 25, y: 25 })).build();
        expect(scoutTask.decide(directed, withDirective(home, {}))).toEqual([
            { kind: 'move', creepName: 's1', target: { x: 25, y: 25, roomName: 'W9N9' }, range: 20 },
        ]);
    });

    test('ends with its directive; the routine scout never ends', () => {
        const home = aRoom().build();
        expect(scoutTask.isDone(directed, withDirective(home, {}))).toBe(false);
        expect(scoutTask.isDone(directed, aTaskContext(home))).toBe(true);
        expect(scoutTask.isDone(task, aTaskContext(home))).toBe(false);
    });
});

describe('routine scouting 2 exits out', () => {
    test('roomsWithinExits walks exits breadth-first', () => {
        const world = worldOf([aRoom().build()], { exits: { W1N1: ['W1N2', 'W2N1'], W1N2: ['W1N1', 'W1N3'], W2N1: ['W1N1', 'W1N2'] } });
        expect([...roomsWithinExits(world, 'W1N1', 2)]).toEqual([['W1N2', 1], ['W2N1', 1], ['W1N3', 2]]);
        expect([...roomsWithinExits(world, 'W1N1', 1)]).toEqual([['W1N2', 1], ['W2N1', 1]]);
    });

    test('stale rooms 2 exits away come after stale adjacent rooms', () => {
        const home = aRoom().withTick(INTEL_STALE_TICKS + 100).build();
        const c = aTaskContext(home, { world: worldOf([home], { exits: { W1N1: ['W1N2'], W1N2: ['W1N1', 'W1N3'] } }), intel: { W1N2: seenAt(50) } });
        expect(staleNeighbors(c)).toEqual(['W1N2', 'W1N3']);
    });
});

