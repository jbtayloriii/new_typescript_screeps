import { describe, expect, test } from '@jest/globals';
import { planSpawns } from './plan_spawns';
import { aRoom } from 'testing/builders/room_snapshot_builder';
import { SpawnRequest } from 'tasks/types';

const WCM = { pattern: [WORK, CARRY, MOVE], maxRepeats: 3 };
const request = (taskName: string, priority: number, urgent = false): SpawnRequest => ({ taskName, priority, body: WCM, urgent });

describe('planSpawns', () => {
    test('spawns the highest-priority request with the task link in memory', () => {
        const room = aRoom().withTick(7).withEnergy(300).withSpawn(10, 10).build();
        const [spawn] = room.structures;

        expect(planSpawns(room, [request('low', 10), request('high', 90)])).toEqual([{
            kind: 'spawn',
            spawnId: spawn.id,
            body: [WORK, CARRY, MOVE],
            name: 'high_7_0',
            memory: { taskName: 'high', baseRoomName: 'W1N1' },
        }]);
    });

    test('sizes bodies to full capacity and waits until it is affordable', () => {
        const room = aRoom().withEnergy(300, 600).withSpawn(10, 10).build();
        // Capacity 600 → 3 repeats (600), but only 300 is available: wait instead of spawning small.
        expect(planSpawns(room, [request('t', 50)])).toEqual([]);

        const full = aRoom().withEnergy(600, 600).withSpawn(10, 10).build();
        expect(planSpawns(full, [request('t', 50)])[0].body).toHaveLength(9);
    });

    test('sizes urgent requests to the energy available now', () => {
        const room = aRoom().withEnergy(300, 600).withSpawn(10, 10).build();
        expect(planSpawns(room, [request('t', 100, true)])[0].body).toEqual([WORK, CARRY, MOVE]);
    });

    test('does not skip an unaffordable top request for a cheaper lower one', () => {
        const room = aRoom().withEnergy(250, 600).withSpawn(10, 10).build();
        const cheap: SpawnRequest = { taskName: 'cheap', priority: 10, body: { pattern: [MOVE], maxRepeats: 1 } };
        expect(planSpawns(room, [request('top', 90), cheap])).toEqual([]);
    });

    test('uses each idle spawn once, skipping busy spawns', () => {
        const room = aRoom().withEnergy(400, 400)
            .withSpawn(10, 10).withSpawn(20, 20, { spawning: true }).withSpawn(30, 30)
            .build();
        const small = (taskName: string, priority: number): SpawnRequest =>
            ({ taskName, priority, body: { pattern: [WORK, CARRY, MOVE], maxRepeats: 1 } });

        const intents = planSpawns(room, [small('a', 90), small('b', 80), small('c', 70)]);

        expect(intents.map(i => [i.memory.taskName, i.spawnId])).toEqual([
            ['a', room.structures[0].id],
            ['b', room.structures[2].id],
        ]);
    });

    test('later spawns only get the energy left over', () => {
        const room = aRoom().withEnergy(400, 400).withSpawn(10, 10).withSpawn(30, 30).build();
        // The first urgent request uses all 400 energy (2 repeats), so the second spawn waits.
        const intents = planSpawns(room, [request('a', 90, true), request('b', 80, true)]);
        expect(intents.map(i => i.memory.taskName)).toEqual(['a']);
    });

    test('does nothing without requests or idle spawns', () => {
        const busy = aRoom().withSpawn(10, 10, { spawning: true }).build();
        expect(planSpawns(busy, [request('t', 50)])).toEqual([]);
        expect(planSpawns(aRoom().withSpawn(10, 10).build(), [])).toEqual([]);
    });
});
