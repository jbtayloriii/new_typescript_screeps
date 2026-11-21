import { describe, expect, test } from '@jest/globals';
import { decideBaseIntents, reconcileTasks } from './base_tick';
import { aRoom, energy, RoomSnapshotBuilder } from 'testing/builders/room_snapshot_builder';
import { worldOf } from 'testing/builders/world';
import { TaskMemory } from 'tasks/types';
import { Intent } from 'intents/types';

function baseMemory(): BaseMemory {
    // Planned recently with nothing new unlocked, so construction stays quiet.
    return { currentControllerLevelPlan: 8, lastBaseLayoutPlanTick: 1, initialSpawn: '10_10', baseLayout: {} };
}

function input(builder: RoomSnapshotBuilder, tasks: TaskMemory[]) {
    const home = builder.withTick(2).build();
    return { world: worldOf([home]), home, baseMemory: baseMemory(), tasks, creeps: home.creepsPresent, intel: {}, directives: {} };
}

const kinds = (intents: Intent[]) => intents.map(i => i.kind);
const member = (taskName: string) => ({ memory: { taskName, baseRoomName: 'W1N1' } });

describe('reconcileTasks', () => {
    test('creates the starting tasks for a new base', () => {
        const changes = reconcileTasks(input(aRoom().withRcl(1).withSource(20, 20).withSpawn(10, 10), []));
        expect(changes.remove).toEqual([]);
        expect(changes.create.map(s => s.type)).toEqual(['mine', 'upgrade', 'repair']);
    });

    test('removes finished and unknown tasks', () => {
        const tasks = [
            { name: 'b', roomName: 'W1N1', type: 'build' },
            { name: 'old', roomName: 'W1N1', type: 'powerHarvest' },
            { name: 'r', roomName: 'W1N1', type: 'repair' },
        ] as unknown as TaskMemory[];

        // No construction sites, so the build task is done
        expect(reconcileTasks(input(aRoom(), tasks)).remove).toEqual(['b', 'old']);
    });
});

describe('decideBaseIntents', () => {
    const tasks = (sourceId: Id<Source>): TaskMemory[] => [
        { name: 'h', roomName: 'W1N1', type: 'mine', sourceId },
        { name: 'u', roomName: 'W1N1', type: 'upgrade' },
    ];

    test('spawns the first harvester in an empty base', () => {
        const i = input(aRoom().withRcl(1).withEnergy(300).withSource(20, 20).withSpawn(10, 10), []);
        const plan = decideBaseIntents({ ...i, tasks: tasks(i.home.sources[0].id) });

        expect(plan.intents).toEqual([expect.objectContaining({
            kind: 'spawn',
            body: [WORK, CARRY, MOVE],
            memory: { taskName: 'h', baseRoomName: 'W1N1' },
        })]);
    });

    test('an orphan fills the top open request instead of a spawn, and works this tick', () => {
        const i = input(aRoom().withRcl(1).withEnergy(300).withSource(20, 20).withSpawn(10, 10)
            .withMyCreep('orphan', 19, 19, member('')), []);
        const plan = decideBaseIntents({ ...i, tasks: tasks(i.home.sources[0].id) });

        expect(plan.intents).toContainEqual({ kind: 'setCreepMemory', creepName: 'orphan', patch: { taskName: 'h', state: undefined, targetId: undefined } });
        expect(plan.intents).toContainEqual({ kind: 'harvest', creepName: 'orphan', targetId: i.home.sources[0].id });
        // The orphan took the first harvester slot, so the spawn makes the second harvester (lower priority)
        const spawn = plan.intents.find(x => x.kind === 'spawn');
        expect(spawn).toMatchObject({ memory: { taskName: 'h' } });
    });

    test('recycles orphans no task can use', () => {
        const i = input(aRoom().withSpawn(10, 10).withMyCreep('scout', 11, 11, { ...member('gone'), activeParts: { [MOVE]: 1 } }), []);
        expect(decideBaseIntents(i).intents).toContainEqual({ kind: 'recycle', spawnId: i.home.structures[0].id, creepName: 'scout' });
    });

    test('creeps of each task act, towers defend, all in one plan', () => {
        const i = input(aRoom().withRcl(1).withEnergy(0).withSource(20, 20).withSpawn(10, 10, { energy: 0 })
            .withTower(25, 25).withHostile(30, 30)
            .withMyCreep('h1', 19, 19, member('h'))
            .withMyCreep('u1', 24, 24, { ...member('u'), memory: { taskName: 'u', baseRoomName: 'W1N1', state: 1 }, store: energy(50) }), []);
        const plan = decideBaseIntents({ ...i, tasks: tasks(i.home.sources[0].id) });

        expect(kinds(plan.intents)).toEqual(expect.arrayContaining(['harvest', 'upgrade', 'towerAttack']));
        // No energy, so nothing spawns this tick
        expect(kinds(plan.intents)).not.toContain('spawn');
    });
});

describe('a source growing from harvesters to a miner', () => {
    const miner = { memory: { taskName: 'm', baseRoomName: 'W1N1' }, activeParts: { [WORK]: 5, [MOVE]: 1 } };

    test('once a miner is affordable it spawns; once it works, the harvester is released and becomes a hauler', () => {
        const sourceId = 'src1' as Id<Source>;
        const builder = () => aRoom().withRcl(2).withEnergy(550, 550).withSource(20, 20, { id: sourceId }).withSpawn(10, 10, { energy: 300 })
            .withMyCreep('h1', 19, 19, member('m'));
        const tasks: TaskMemory[] = [
            { name: 'm', roomName: 'W1N1', type: 'mine', sourceId },
            { name: 'u', roomName: 'W1N1', type: 'upgrade' },
        ];

        // 1. The harvester keeps working while the miner spawns.
        const first = decideBaseIntents(input(builder(), tasks));
        expect(first.intents).toContainEqual(expect.objectContaining({ kind: 'spawn', body: [WORK, WORK, WORK, WORK, WORK, MOVE], memory: expect.objectContaining({ taskName: 'm' }) }));
        expect(first.intents).toContainEqual({ kind: 'harvest', creepName: 'h1', targetId: sourceId });

        // 2. The miner works: the harvester is released, and a haul task is needed.
        const withMiner = input(builder().withMyCreep('miner', 21, 21, miner), tasks);
        expect(decideBaseIntents(withMiner).intents).toContainEqual({ kind: 'setCreepMemory', creepName: 'h1', patch: { taskName: '' } });
        expect(reconcileTasks(withMiner).create).toContainEqual({ type: 'haul' });

        // 3. The released harvester is adopted as a hauler.
        const released = input(aRoom().withRcl(2).withEnergy(550, 550).withSource(20, 20, { id: sourceId }).withSpawn(10, 10, { energy: 300 })
            .withMyCreep('h1', 19, 19, member('')).withMyCreep('miner', 21, 21, miner),
            [...tasks, { name: 'haul', roomName: 'W1N1', type: 'haul' }]);
        expect(decideBaseIntents(released).intents).toContainEqual(expect.objectContaining({
            kind: 'setCreepMemory', creepName: 'h1', patch: expect.objectContaining({ taskName: 'haul' }),
        }));
    });
});

describe('directives in the base tick', () => {
    test('an active directive assigned to the base gets a task', () => {
        const i = input(aRoom().withRcl(3).withEnergy(300, 300).withSpawn(10, 10), []);
        const directives = {
            d1: { id: 'd1', type: 'scout' as const, targetRoom: 'W9N9', source: 'manual' as const, status: 'active' as const, createdAt: 1, baseRoomName: 'W1N1' },
            d2: { id: 'd2', type: 'scout' as const, targetRoom: 'W8N8', source: 'manual' as const, status: 'active' as const, createdAt: 1, baseRoomName: 'W2N2' },
        };
        expect(reconcileTasks({ ...i, directives }).create).toContainEqual({ type: 'scout', targetRoom: 'W9N9', directiveId: 'd1' });
        expect(reconcileTasks({ ...i, directives }).create).not.toContainEqual(expect.objectContaining({ directiveId: 'd2' }));
    });
});

