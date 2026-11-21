import { describe, expect, test } from '@jest/globals';
import { assignOrphans, canFillRequest, decideRecycle, groupCreepsByTask } from './creep_assignment';
import { aRoom } from 'testing/builders/room_snapshot_builder';
import { SpawnRequest } from './types';
import { MyCreepSnapshot } from 'snapshot/types';

const WCM = { pattern: [WORK, CARRY, MOVE], maxRepeats: 1 };
const inTask = (taskName: string) => ({ memory: { taskName, baseRoomName: 'W1N1' } });

function creeps(room = aRoom()
    .withMyCreep('a1', 10, 10, inTask('A'))
    .withMyCreep('a2', 10, 11, { ...inTask('A'), spawning: true })
    .withMyCreep('b1', 10, 12, inTask('B'))
    .withMyCreep('orphan', 10, 13, inTask('gone'))
    .build()) {
    return room.creepsPresent;
}

describe('groupCreepsByTask', () => {
    test('groups by taskName, counting spawning creeps, and collects orphans', () => {
        const { byTask, orphans } = groupCreepsByTask(creeps(), ['A', 'B', 'C']);

        expect(byTask.get('A')!.map(c => c.name)).toEqual(['a1', 'a2']);
        expect(byTask.get('B')!.map(c => c.name)).toEqual(['b1']);
        expect(byTask.get('C')).toEqual([]);
        expect(orphans.map(c => c.name)).toEqual(['orphan']);
    });
});

describe('canFillRequest', () => {
    const request: SpawnRequest = { taskName: 't', priority: 1, body: WCM };

    test('requires every part type in the pattern', () => {
        const room = aRoom()
            .withMyCreep('worker', 1, 1)
            .withMyCreep('mover', 1, 2, { activeParts: { [MOVE]: 2 } })
            .build();
        expect(canFillRequest(room.creepsPresent[0], request)).toBe(true);
        expect(canFillRequest(room.creepsPresent[1], request)).toBe(false);
    });
});

describe('assignOrphans', () => {
    const [orphanA, orphanB] = aRoom().withMyCreep('o1', 1, 1).withMyCreep('o2', 1, 2).build().creepsPresent;

    /** Each task wants `wanted[task]` creeps; requests are open until then. */
    const requestsFor = (wanted: Record<string, { count: number, priority: number }>) =>
        (byTask: ReadonlyMap<string, readonly MyCreepSnapshot[]>): SpawnRequest[] =>
            Object.entries(wanted).flatMap(([taskName, { count, priority }]) =>
                (byTask.get(taskName)?.length ?? 0) < count ? [{ taskName, priority, body: WCM }] : []);

    test('fills the highest-priority open request first, re-evaluating after each adoption', () => {
        const byTask = new Map([['harvest', []], ['build', []]]);
        const result = assignOrphans([orphanA, orphanB], byTask,
            requestsFor({ harvest: { count: 1, priority: 100 }, build: { count: 1, priority: 80 } }));

        expect(result.assignments.map(a => [a.creep.name, a.taskName])).toEqual([['o1', 'harvest'], ['o2', 'build']]);
        expect(result.unassigned).toEqual([]);
        // Adopted creeps appear in their new group with updated memory
        expect(result.byTask.get('harvest')![0].memory.taskName).toBe('harvest');
    });

    test('falls back to the fallback task, then leaves creeps unassigned', () => {
        const byTask = new Map([['upgrade', []]]);
        const none = () => [];

        expect(assignOrphans([orphanA], byTask, none, { taskName: 'upgrade', canTake: () => true }).assignments.map(a => a.taskName)).toEqual(['upgrade']);
        expect(assignOrphans([orphanA], byTask, none).unassigned).toEqual([orphanA]);
        // A fallback that doesn't exist is ignored
        expect(assignOrphans([orphanA], byTask, none, { taskName: 'missing', canTake: () => true }).unassigned).toEqual([orphanA]);
    });

    test('skips requests the creep body cannot fill', () => {
        const [mover] = aRoom().withMyCreep('m', 1, 1, { activeParts: { [MOVE]: 1 } }).build().creepsPresent;
        const byTask = new Map([['harvest', []]]);
        const result = assignOrphans([mover], byTask, requestsFor({ harvest: { count: 1, priority: 100 } }));
        expect(result.unassigned).toEqual([mover]);
    });

    test('does not modify the input groups', () => {
        const byTask = new Map<string, MyCreepSnapshot[]>([['upgrade', []]]);
        assignOrphans([orphanA], byTask, () => [], { taskName: 'upgrade', canTake: () => true });
        expect(byTask.get('upgrade')).toEqual([]);
    });
});

describe('decideRecycle', () => {
    test('moves to the closest spawn, then recycles next to it', () => {
        const far = aRoom().withSpawn(10, 10).withSpawn(40, 40).withMyCreep('c', 15, 15).build();
        expect(decideRecycle(far.creepsPresent[0], far)).toEqual([
            { kind: 'move', creepName: 'c', target: far.structures[0].pos, range: 1 },
        ]);

        const near = aRoom().withSpawn(10, 10).withMyCreep('c', 11, 11).build();
        expect(decideRecycle(near.creepsPresent[0], near)).toEqual([
            { kind: 'recycle', spawnId: near.structures[0].id, creepName: 'c' },
        ]);
    });

    test('does nothing without a spawn', () => {
        const room = aRoom().withMyCreep('c', 11, 11).build();
        expect(decideRecycle(room.creepsPresent[0], room)).toEqual([]);
    });
});

describe('minimal bodies and request memory', () => {
    test('a small harvester can fill a hauler request but not a miner request', () => {
        const [harvester] = aRoom().withMyCreep('h', 1, 1).build().creepsPresent;
        const miner: SpawnRequest = { taskName: 'mine', priority: 105, body: { base: [WORK, WORK, WORK, WORK, WORK, MOVE], pattern: [], maxRepeats: 0 } };
        const hauler: SpawnRequest = { taskName: 'haul', priority: 100, body: { pattern: [CARRY, MOVE], maxRepeats: 10 } };
        expect(canFillRequest(harvester, miner)).toBe(false);
        expect(canFillRequest(harvester, hauler)).toBe(true);

        const result = assignOrphans([harvester], new Map([['mine', []], ['haul', []]]), () => [miner, hauler]);
        expect(result.assignments.map(a => a.taskName)).toEqual(['haul']);
    });

    test("adopted creeps get the request's initial memory", () => {
        const [orphan] = aRoom().withMyCreep('o', 1, 1).build().creepsPresent;
        const request: SpawnRequest = { taskName: 'rm', priority: 1, body: WCM, memory: { role: 'miner', targetId: 's' as Id<Source> } };
        const result = assignOrphans([orphan], new Map([['rm', []]]), () => [request]);
        expect(result.assignments[0].patch).toEqual({
            taskName: 'rm', state: undefined, targetId: 's', role: 'miner', targetRoom: undefined,
        });
    });

    test('the fallback only takes creeps it can use', () => {
        const [mover] = aRoom().withMyCreep('m', 1, 1, { activeParts: { [MOVE]: 1 } }).build().creepsPresent;
        const fallback = { taskName: 'upgrade', canTake: (c: MyCreepSnapshot) => (c.activeParts[WORK] ?? 0) > 0 };
        expect(assignOrphans([mover], new Map([['upgrade', []]]), () => [], fallback).unassigned).toEqual([mover]);
    });
});
