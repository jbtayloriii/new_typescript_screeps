import { describe, expect, test } from '@jest/globals';
import { aRoom, energy, RoomSnapshotBuilder } from 'testing/builders/room_snapshot_builder';
import { worldOf } from 'testing/builders/world';
import { harvestTask, HARVESTERS_PER_SOURCE, HARVEST_PRIORITY } from './harvest_task';
import { upgradeTask, MAX_UPGRADERS, FIRST_UPGRADER_PRIORITY } from './upgrade_task';
import { buildTask, BUILD_PRIORITY } from './build_task';
import { repairTask, REPAIR_PRIORITY } from './repair_task';
import { TaskContext } from './types';
import { WorkerState } from './behaviors';

/** Context with every creep present in the room belonging to the task. */
function ctx(builder: RoomSnapshotBuilder): TaskContext {
    const home = builder.build();
    return { world: worldOf([home]), home, creeps: home.creepsPresent };
}

const member = (taskName: string, extra: Partial<CreepMemory> = {}) =>
    ({ memory: { taskName, baseRoomName: 'W1N1', ...extra } });

describe('harvestTask', () => {
    const room = () => aRoom().withSource(20, 20).withSpawn(10, 10, { energy: 0 });
    const task = (sourceId: Id<Source>) => ({ name: 'h', roomName: 'W1N1', type: 'harvest' as const, sourceId });

    test('requests harvesters up to the per-source limit, the first urgent', () => {
        const c = ctx(room());
        const requests = harvestTask.getSpawnRequests(task(c.home.sources[0].id), c);

        expect(requests).toHaveLength(HARVESTERS_PER_SOURCE);
        expect(requests[0]).toMatchObject({ taskName: 'h', priority: HARVEST_PRIORITY, urgent: true });
        expect(requests[1]).toMatchObject({ urgent: false });
        expect(requests[1].priority).toBeLessThan(requests[0].priority);
    });

    test('counts existing creeps, including spawning ones', () => {
        const c = ctx(room().withMyCreep('a', 1, 1, member('h')).withMyCreep('b', 1, 1, { ...member('h'), spawning: true }));
        expect(harvestTask.getSpawnRequests(task(c.home.sources[0].id), c)).toEqual([]);
    });

    test('harvests its own source, then delivers to the spawn', () => {
        const c = ctx(room()
            .withMyCreep('gatherer', 19, 19, member('h', { state: WorkerState.GATHERING }))
            .withMyCreep('carrier', 11, 11, { ...member('h', { state: WorkerState.WORKING }), store: energy(50) }));
        const t = task(c.home.sources[0].id);

        const intents = harvestTask.decide(t, c);

        expect(intents).toContainEqual({ kind: 'harvest', creepName: 'gatherer', targetId: t.sourceId });
        expect(intents).toContainEqual({ kind: 'transfer', creepName: 'carrier', targetId: c.home.structures[0].id, resource: RESOURCE_ENERGY });
    });

    test('is done only when its source is gone', () => {
        const c = ctx(room());
        expect(harvestTask.isDone(task(c.home.sources[0].id), c)).toBe(false);
        expect(harvestTask.isDone(task('missing' as Id<Source>), c)).toBe(true);
    });
});

describe('upgradeTask', () => {
    const task = { name: 'u', roomName: 'W1N1', type: 'upgrade' as const };

    test('requests up to the max upgraders, the first at higher priority', () => {
        const requests = upgradeTask.getSpawnRequests(task, ctx(aRoom().withRcl(1)));
        expect(requests).toHaveLength(MAX_UPGRADERS);
        expect(requests[0].priority).toBe(FIRST_UPGRADER_PRIORITY);
        expect(requests[1].priority).toBeLessThan(requests[0].priority);

        const withOne = ctx(aRoom().withRcl(1).withMyCreep('a', 1, 1, member('u')));
        expect(upgradeTask.getSpawnRequests(task, withOne)).toHaveLength(MAX_UPGRADERS - 1);
    });

    test('upgrades when full', () => {
        const c = ctx(aRoom().withRcl(1).withMyCreep('a', 24, 24, { ...member('u', { state: WorkerState.WORKING }), store: energy(50) }));
        expect(upgradeTask.decide(task, c)).toEqual([{ kind: 'upgrade', creepName: 'a', targetId: c.home.controller!.id }]);
    });

    test('is done when the controller is no longer mine', () => {
        expect(upgradeTask.isDone(task, ctx(aRoom().withRcl(1)))).toBe(false);
        expect(upgradeTask.isDone(task, ctx(aRoom().withRcl(1, { my: false })))).toBe(true);
        expect(upgradeTask.isDone(task, ctx(aRoom()))).toBe(true);
    });
});

describe('buildTask', () => {
    const task = { name: 'b', roomName: 'W1N1', type: 'build' as const };

    test('requests one builder', () => {
        expect(buildTask.getSpawnRequests(task, ctx(aRoom()))).toEqual([
            expect.objectContaining({ taskName: 'b', priority: BUILD_PRIORITY }),
        ]);
        expect(buildTask.getSpawnRequests(task, ctx(aRoom().withMyCreep('a', 1, 1, member('b'))))).toEqual([]);
    });

    test('builds when full', () => {
        const c = ctx(aRoom().withConstructionSite(STRUCTURE_ROAD, 11, 11)
            .withMyCreep('a', 10, 10, { ...member('b', { state: WorkerState.WORKING }), store: energy(50) }));
        expect(buildTask.decide(task, c)).toContainEqual({ kind: 'build', creepName: 'a', targetId: c.home.constructionSites[0].id });
    });

    test('is done when there are no construction sites', () => {
        expect(buildTask.isDone(task, ctx(aRoom().withConstructionSite(STRUCTURE_ROAD, 1, 1)))).toBe(false);
        expect(buildTask.isDone(task, ctx(aRoom()))).toBe(true);
    });
});

describe('repairTask', () => {
    const task = { name: 'r', roomName: 'W1N1', type: 'repair' as const };

    test('requests one repairer', () => {
        expect(repairTask.getSpawnRequests(task, ctx(aRoom()))).toEqual([
            expect.objectContaining({ taskName: 'r', priority: REPAIR_PRIORITY }),
        ]);
        expect(repairTask.getSpawnRequests(task, ctx(aRoom().withMyCreep('a', 1, 1, member('r'))))).toEqual([]);
    });

    test('repairs when full', () => {
        const c = ctx(aRoom()
            .withStructure(STRUCTURE_ROAD, 11, 11, { owner: 'none', hits: 100, hitsMax: 5000 })
            .withMyCreep('a', 10, 10, { ...member('r', { state: WorkerState.WORKING }), store: energy(50) }));
        expect(repairTask.decide(task, c)).toContainEqual({ kind: 'repair', creepName: 'a', targetId: c.home.structures[0].id });
    });

    test('is never done', () => {
        expect(repairTask.isDone(task, ctx(aRoom()))).toBe(false);
    });
});
