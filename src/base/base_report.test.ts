import { describe, expect, test } from '@jest/globals';
import { decideBaseIntents } from './base_tick';
import { aRoom } from 'testing/builders/room_snapshot_builder';
import { aBaseMemory } from 'testing/builders/context';
import { worldOf } from 'testing/builders/world';
import { TaskMemory } from 'tasks/types';

describe('the base report', () => {
    const SOURCE = 'src1' as Id<Source>;
    const tasks: TaskMemory[] = [
        { name: 'm', roomName: 'W1N1', type: 'mine', sourceId: SOURCE, containerTile: { x: 21, y: 21 } },
        { name: 'u', roomName: 'W1N1', type: 'upgrade' },
        { name: 'rm', roomName: 'W1N1', type: 'remoteMine', targetRoom: 'W1N2', directiveId: 'd3' },
    ];

    function plan(report: boolean) {
        const home = aRoom().withTick(500).withRcl(2, { progress: 250, progressTotal: 1000 }).withEnergy(300, 550)
            .withSource(20, 20, { id: SOURCE, openSpots: 1 }).withSpawn(10, 10)
            .withMyCreep('h1', 19, 19, { memory: { taskName: 'm', baseRoomName: 'W1N1', state: 0 }, ticksToLive: 80 })
            .build();
        return decideBaseIntents({
            world: worldOf([home]), home, baseMemory: aBaseMemory(), tasks, creeps: home.creepsPresent, intel: {}, directives: {},
        }, { report });
    }

    test('is only built when asked for', () => {
        expect(plan(false).report).toBeUndefined();
    });

    test('summarizes the room, tasks and spawn queue', () => {
        const report = plan(true).report!;
        expect(report).toMatchObject({
            roomName: 'W1N1', tick: 500, rcl: 2, rclProgress: 0.25, energyAvailable: 300, energyCapacity: 550,
            spawns: { total: 1, busy: 0 },
        });

        const mine = report.tasks.find(t => t.type === 'mine')!;
        expect(mine).toMatchObject({ wanted: 2, detail: '1 tile, no container' });
        expect(mine.creeps).toEqual([{ name: 'h1', role: undefined, state: 0, ticksToLive: 80, spawning: false, miner: false }]);

        expect(report.tasks.find(t => t.type === 'remoteMine')).toMatchObject({ label: 'W1N2 (d3)' });
        expect(report.tasks.find(t => t.type === 'upgrade')!.detail).toMatch(/^WORK 0\/\d+$/);

        // The miner (550) is the top request, and the room only has 300 energy
        expect(report.spawnQueue[0]).toMatchObject({ taskName: 'm', taskType: 'mine', status: 'waiting', cost: 550 });
    });
});
