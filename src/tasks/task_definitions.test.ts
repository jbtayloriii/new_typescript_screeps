import { describe, expect, test } from '@jest/globals';
import { aRoom, energy, RoomSnapshotBuilder } from 'testing/builders/room_snapshot_builder';
import { aTaskContext } from 'testing/builders/context';
import { harvestTask, HARVESTERS_PER_SOURCE, HARVEST_PRIORITY } from './harvest_task';
import { upgradeTask, MAX_UPGRADERS, FIRST_UPGRADER_PRIORITY } from './upgrade_task';
import { buildTask, BUILD_PRIORITY } from './build_task';
import { repairTask, REPAIR_PRIORITY } from './repair_task';
import { TaskContext } from './types';
import { WorkerState } from './behaviors';

/** Context with every creep present in the room belonging to the task. */
function ctx(builder: RoomSnapshotBuilder): TaskContext {
    return aTaskContext(builder.build());
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

    test('requests upgraders until their WORK parts reach the budget from spare income', () => {
        const home = aRoom().withRcl(3).withEnergy(800, 800).build();
        // 10 energy/tick of income and no upkeep: floor(10 / (1 + 0.133)) = 8 WORK.
        const rich = upgradeTask.getSpawnRequests(task, aTaskContext(home, { economy: { incomePerTick: 10 } }));
        expect(rich.length).toBeLessThanOrEqual(MAX_UPGRADERS);
        expect(rich[0].priority).toBe(FIRST_UPGRADER_PRIORITY);
        expect(rich[1].priority).toBeLessThan(rich[0].priority);
        // 800 capacity → 4 WORK per upgrader, so 2 upgraders cover 8 WORK
        expect(rich).toHaveLength(2);

        const existing = aRoom().withRcl(3).withEnergy(800, 800)
            .withMyCreep('a', 1, 1, { ...member('u'), activeParts: { [WORK]: 4, [CARRY]: 4, [MOVE]: 4 } }).build();
        expect(upgradeTask.getSpawnRequests(task, aTaskContext(existing, { economy: { incomePerTick: 10 } }))).toHaveLength(1);
    });

    test('always wants at least one upgrader, with a body capped to the budget', () => {
        const requests = upgradeTask.getSpawnRequests(task, ctx(aRoom().withRcl(1)));
        expect(requests).toHaveLength(1);
        expect(requests[0].body.maxRepeats).toBe(1);
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

    test('requests builders for the remaining work', () => {
        const small = aRoom().withConstructionSite(STRUCTURE_ROAD, 5, 5, { progressTotal: 300 });
        expect(buildTask.getSpawnRequests(task, ctx(small))).toEqual([
            expect.objectContaining({ taskName: 'b', priority: BUILD_PRIORITY }),
        ]);
        expect(buildTask.getSpawnRequests(task, ctx(small.withMyCreep('a', 1, 1, member('b'))))).toEqual([]);

        const big = aRoom()
            .withConstructionSite(STRUCTURE_EXTENSION, 5, 5, { progressTotal: 3000 })
            .withConstructionSite(STRUCTURE_STORAGE, 6, 6, { progressTotal: 30000 });
        expect(buildTask.getSpawnRequests(task, ctx(big))).toHaveLength(3);
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
