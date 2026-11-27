import { describe, expect, test } from '@jest/globals';
import {
    buildNearest, CRITICAL_REPAIR_HITS, deliverEnergy, gatherEnergy, MIN_STORE_WITHDRAW_ENERGY,
    repairNearest, runWorker, upgradeController, WorkerState,
} from './behaviors';
import { aRoom, energy } from 'testing/builders/room_snapshot_builder';

const mem = (extra: Partial<CreepMemory> = {}): CreepMemory => ({ taskName: 't', baseRoomName: 'W1N1', ...extra });

describe('runWorker', () => {
    const gather = () => ({ action: { kind: 'say' as const, creepName: 'c', message: 'gather' } });
    const work = () => ({ action: { kind: 'say' as const, creepName: 'c', message: 'work' } });

    function run(state: WorkerState | undefined, store = energy(25), spawning = false) {
        const room = aRoom().withMyCreep('c', 10, 10, { memory: mem({ state, targetId: 'old' as Id<Source> }), store, spawning }).build();
        return runWorker(room.creepsPresent[0], room, gather, work);
    }

    test('starts gathering, saving the initial state', () => {
        expect(run(undefined)).toEqual([
            { kind: 'say', creepName: 'c', message: 'gather' },
            { kind: 'setCreepMemory', creepName: 'c', patch: { state: WorkerState.GATHERING, targetId: undefined } },
        ]);
    });

    test('keeps gathering while not full, without memory writes', () => {
        expect(run(WorkerState.GATHERING)).toEqual([{ kind: 'say', creepName: 'c', message: 'gather' }]);
    });

    test('switches to working when full, clearing the target', () => {
        expect(run(WorkerState.GATHERING, energy(50))).toEqual([
            { kind: 'say', creepName: 'c', message: 'work' },
            { kind: 'setCreepMemory', creepName: 'c', patch: { state: WorkerState.WORKING, targetId: undefined } },
        ]);
    });

    test('keeps working until empty, then gathers', () => {
        expect(run(WorkerState.WORKING, energy(1))[0]).toEqual({ kind: 'say', creepName: 'c', message: 'work' });
        expect(run(WorkerState.WORKING, energy(0))).toEqual([
            { kind: 'say', creepName: 'c', message: 'gather' },
            { kind: 'setCreepMemory', creepName: 'c', patch: { state: WorkerState.GATHERING, targetId: undefined } },
        ]);
    });

    test('does nothing while spawning', () => {
        expect(run(undefined, energy(0), true)).toEqual([]);
    });
});

describe('gatherEnergy', () => {
    test('with fromStores, prefers ruins, then storage, then containers', () => {
        const base = () => aRoom().withSource(30, 30).withMyCreep('c', 10, 10, { memory: mem() });
        const gather = gatherEnergy({ fromStores: true });

        const withRuin = base().withRuin(11, 11, 50)
            .withStructure(STRUCTURE_STORAGE, 12, 12, { store: energy(5000, 1e6) }).build();
        expect(gather(withRuin.creepsPresent[0], withRuin).action)
            .toEqual({ kind: 'withdraw', creepName: 'c', targetId: withRuin.ruins[0].id, resource: RESOURCE_ENERGY });

        const withStorage = base()
            .withStructure(STRUCTURE_STORAGE, 20, 20, { store: energy(5000, 1e6) })
            .withStructure(STRUCTURE_CONTAINER, 11, 11, { owner: 'none', store: energy(500, 2000) }).build();
        expect(gather(withStorage.creepsPresent[0], withStorage).action)
            .toEqual({ kind: 'move', creepName: 'c', target: withStorage.structures[0].pos, range: 1 });

        const withContainer = base()
            .withStructure(STRUCTURE_CONTAINER, 11, 11, { owner: 'none', store: energy(500, 2000) }).build();
        expect(gather(withContainer.creepsPresent[0], withContainer).action?.kind).toBe('withdraw');
    });

    test('ignores nearly empty stores and falls back to harvesting', () => {
        const room = aRoom().withSource(11, 11)
            .withStructure(STRUCTURE_CONTAINER, 10, 11, { owner: 'none', store: energy(MIN_STORE_WITHDRAW_ENERGY - 1, 2000) })
            .withMyCreep('c', 10, 10, { memory: mem() }).build();
        const step = gatherEnergy({ fromStores: true })(room.creepsPresent[0], room);

        expect(step.action).toEqual({ kind: 'harvest', creepName: 'c', targetId: room.sources[0].id });
        expect(step.memory).toEqual({ targetId: room.sources[0].id });
    });

    test('without fromStores, harvests even when stores have energy', () => {
        const room = aRoom().withSource(11, 11).withRuin(10, 11, 500).withMyCreep('c', 10, 10, { memory: mem() }).build();
        expect(gatherEnergy({ fromStores: false })(room.creepsPresent[0], room).action?.kind).toBe('harvest');
    });

    test('harvests the given source', () => {
        const room = aRoom().withSource(11, 11).withSource(40, 40).withMyCreep('c', 10, 10, { memory: mem() }).build();
        const far = room.sources[1];
        expect(gatherEnergy({ fromStores: false, sourceId: far.id })(room.creepsPresent[0], room).action)
            .toEqual({ kind: 'move', creepName: 'c', target: far.pos, range: 1 });
    });

    test('picks the source with the most free tiles, then the closest', () => {
        const room = aRoom().withSource(12, 10).withSource(30, 30).withMyCreep('c', 10, 10, { memory: mem() }).build();
        expect(gatherEnergy({ fromStores: false })(room.creepsPresent[0], room).memory).toEqual({ targetId: room.sources[0].id });

        // Another creep next to the close source takes one of its tiles
        const crowded = aRoom().withSource(12, 10).withSource(30, 30)
            .withMyCreep('c', 10, 10, { memory: mem() }).withMyCreep('other', 13, 10, { memory: mem() }).build();
        expect(gatherEnergy({ fromStores: false })(crowded.creepsPresent[0], crowded).memory).toEqual({ targetId: crowded.sources[1].id });
    });

    test('waits rather than crowding sources whose tiles are all taken', () => {
        const builder = aRoom().withSource(12, 10, { openSpots: 1 }).withSource(30, 30, { openSpots: 1 })
            .withMyCreep('c', 10, 10, { memory: mem() })
            .withMyCreep('atFirst', 13, 10, { memory: mem() });
        const second = builder.build().sources[1].id;
        const room = builder.withMyCreep('headingToSecond', 20, 20, { memory: mem({ targetId: second }) }).build();

        expect(gatherEnergy({ fromStores: false })(room.creepsPresent[0], room)).toEqual({});
    });

    test('keeps a remembered source without rewriting memory', () => {
        const room = aRoom().withSource(12, 10).withSource(40, 40).build();
        const far = room.sources[1];
        const creep = { ...aRoom().withMyCreep('c', 10, 10).build().creepsPresent[0], memory: mem({ targetId: far.id }) };

        const step = gatherEnergy({ fromStores: false })(creep, room);

        expect(step.action).toEqual({ kind: 'move', creepName: 'c', target: far.pos, range: 1 });
        expect(step.memory).toBeUndefined();
    });

    test('waits next to an empty source instead of harvesting', () => {
        const room = aRoom().withSource(11, 11, { energy: 0 }).withMyCreep('c', 10, 10, { memory: mem() }).build();
        const step = gatherEnergy({ fromStores: false, sourceId: room.sources[0].id })(room.creepsPresent[0], room);
        expect(step.action).toBeUndefined();
    });
});

describe('deliverEnergy', () => {
    test('fills spawns and extensions before towers and storage', () => {
        const room = aRoom()
            .withTower(11, 11, { energy: 0 })
            .withStructure(STRUCTURE_STORAGE, 10, 11, { store: energy(0, 1e6) })
            .withStructure(STRUCTURE_EXTENSION, 30, 30, { store: energy(0, 50) })
            .withMyCreep('c', 10, 10, { memory: mem(), store: energy(50) })
            .build();
        const extension = room.structures[2];
        const step = deliverEnergy(room.creepsPresent[0], room);

        expect(step.action).toEqual({ kind: 'move', creepName: 'c', target: extension.pos, range: 1 });
        expect(step.memory).toEqual({ targetId: extension.id });
    });

    test('keeps the remembered target while it has room', () => {
        const room = aRoom()
            .withSpawn(11, 11, { energy: 100 })
            .withTower(10, 11, { energy: 0 })
            .build();
        const tower = room.structures[1];
        const creep = { ...aRoom().withMyCreep('c', 10, 10).build().creepsPresent[0], memory: mem({ targetId: tower.id }) };

        expect(deliverEnergy(creep, room)).toEqual({
            action: { kind: 'transfer', creepName: 'c', targetId: tower.id, resource: RESOURCE_ENERGY },
            memory: undefined,
        });
    });

    test('drops a full remembered target', () => {
        const room = aRoom().withSpawn(11, 11, { energy: 300 }).withStructure(STRUCTURE_EXTENSION, 30, 30, { store: energy(0, 50) }).build();
        const [spawn, extension] = room.structures;
        const creep = { ...aRoom().withMyCreep('c', 10, 10).build().creepsPresent[0], memory: mem({ targetId: spawn.id }) };
        expect(deliverEnergy(creep, room).memory).toEqual({ targetId: extension.id });
    });

    test('upgrades the controller when nothing needs energy', () => {
        const room = aRoom().withRcl(2).withSpawn(11, 11, { energy: 300 }).withMyCreep('c', 24, 24, { memory: mem() }).build();
        expect(deliverEnergy(room.creepsPresent[0], room).action)
            .toEqual({ kind: 'upgrade', creepName: 'c', targetId: room.controller!.id });
    });

    test('ignores structures owned by others', () => {
        const room = aRoom().withSpawn(11, 11, { energy: 0, owner: 'other' }).withMyCreep('c', 10, 10, { memory: mem() }).build();
        expect(deliverEnergy(room.creepsPresent[0], room).action).toBeUndefined();
    });
});

describe('upgradeController', () => {
    test('upgrades my controller, from range 3', () => {
        const room = aRoom().withRcl(1).withMyCreep('c', 10, 10).build();
        expect(upgradeController(room.creepsPresent[0], room).action)
            .toEqual({ kind: 'move', creepName: 'c', target: room.controller!.pos, range: 3 });
    });

    test('does nothing without my controller', () => {
        const room = aRoom().withRcl(1, { my: false }).withMyCreep('c', 24, 24).build();
        expect(upgradeController(room.creepsPresent[0], room)).toEqual({});
    });
});

describe('buildNearest', () => {
    test('builds the closest site and remembers it', () => {
        const room = aRoom()
            .withConstructionSite(STRUCTURE_ROAD, 40, 40)
            .withConstructionSite(STRUCTURE_EXTENSION, 12, 12)
            .withMyCreep('c', 10, 10, { memory: mem() }).build();
        const close = room.constructionSites[1];
        expect(buildNearest(room.creepsPresent[0], room)).toEqual({
            action: { kind: 'build', creepName: 'c', targetId: close.id },
            memory: { targetId: close.id },
        });
    });

    test('builds the most important site first, even if a less important one is closer', () => {
        const room = aRoom()
            .withConstructionSite(STRUCTURE_ROAD, 11, 11)
            .withConstructionSite(STRUCTURE_EXTENSION, 40, 40)
            .withMyCreep('c', 10, 10, { memory: mem() }).build();
        expect(buildNearest(room.creepsPresent[0], room).memory).toEqual({ targetId: room.constructionSites[1].id });
    });

    test('drops a remembered site when a more important one appears', () => {
        const room = aRoom().withConstructionSite(STRUCTURE_ROAD, 11, 11).withConstructionSite(STRUCTURE_EXTENSION, 40, 40).build();
        const [road, extension] = room.constructionSites;
        const creep = { ...aRoom().withMyCreep('c', 10, 10).build().creepsPresent[0], memory: mem({ targetId: road.id }) };
        expect(buildNearest(creep, room).memory).toEqual({ targetId: extension.id });
    });

    test('keeps the remembered site', () => {
        const room = aRoom().withConstructionSite(STRUCTURE_ROAD, 40, 40).withConstructionSite(STRUCTURE_ROAD, 12, 12).build();
        const far = room.constructionSites[0];
        const creep = { ...aRoom().withMyCreep('c', 10, 10).build().creepsPresent[0], memory: mem({ targetId: far.id }) };
        expect(buildNearest(creep, room).memory).toBeUndefined();
    });
});

describe('repairNearest', () => {
    test('repairs critical structures first, then the closest damaged one', () => {
        // RCL 3, so walls have a repair target
        const room = aRoom().withRcl(3)
            .withStructure(STRUCTURE_ROAD, 11, 11, { owner: 'none', hits: 2000, hitsMax: 5000 })
            .withStructure(STRUCTURE_WALL, 40, 40, { owner: 'none', hits: CRITICAL_REPAIR_HITS, hitsMax: 3e8 })
            .withMyCreep('c', 10, 10, { memory: mem() }).build();
        expect(repairNearest(new Set(['40_40']))(room.creepsPresent[0], room).memory).toEqual({ targetId: room.structures[1].id });

        const noCritical = aRoom()
            .withStructure(STRUCTURE_ROAD, 30, 30, { owner: 'none', hits: 2000, hitsMax: 5000 })
            .withStructure(STRUCTURE_ROAD, 11, 11, { owner: 'none', hits: 2000, hitsMax: 5000 })
            .withMyCreep('c', 10, 10, { memory: mem() }).build();
        expect(repairNearest(new Set())(noCritical.creepsPresent[0], noCritical).action)
            .toEqual({ kind: 'repair', creepName: 'c', targetId: noCritical.structures[1].id });
    });

    test('skips walls the base layout does not plan', () => {
        const room = aRoom().withRcl(3)
            .withStructure(STRUCTURE_WALL, 23, 24, { owner: 'none', hits: 1, hitsMax: 3e8 })
            .withMyCreep('c', 24, 24, { memory: mem() }).build();
        expect(repairNearest(new Set())(room.creepsPresent[0], room).action?.kind).toBe('upgrade');
    });

    test('skips healthy, high-hit and enemy structures, falling back to upgrading', () => {
        const room = aRoom().withRcl(1)
            .withStructure(STRUCTURE_ROAD, 11, 11, { owner: 'none', hits: 5000, hitsMax: 5000 })
            .withStructure(STRUCTURE_WALL, 12, 12, { owner: 'none', hits: 10001, hitsMax: 3e8 })
            .withStructure(STRUCTURE_EXTENSION, 13, 13, { owner: 'other', hits: 10, hitsMax: 1000 })
            .withMyCreep('c', 24, 24, { memory: mem() }).build();
        expect(repairNearest(new Set())(room.creepsPresent[0], room).action?.kind).toBe('upgrade');
    });
});

describe('controller container', () => {
    test('haulers fill it after towers, before storage', () => {
        const room = aRoom().withRcl(3)
            .withStructure(STRUCTURE_STORAGE, 11, 11, { store: energy(0, 1e6) })
            .withStructure(STRUCTURE_CONTAINER, 23, 23, { owner: 'none', store: energy(0, 2000) })
            .withMyCreep('c', 10, 10, { memory: mem(), store: energy(50) })
            .build();
        expect(deliverEnergy(room.creepsPresent[0], room).memory).toEqual({ targetId: room.structures[1].id });
    });

    test('upgraders gather from it before other containers', () => {
        const room = aRoom().withRcl(3)
            .withStructure(STRUCTURE_CONTAINER, 11, 11, { owner: 'none', store: energy(1000, 2000) })
            .withStructure(STRUCTURE_CONTAINER, 23, 23, { owner: 'none', store: energy(500, 2000) })
            .withMyCreep('c', 10, 10, { memory: mem() })
            .build();
        expect(gatherEnergy({ fromStores: true })(room.creepsPresent[0], room).action)
            .toEqual({ kind: 'move', creepName: 'c', target: room.structures[1].pos, range: 1 });
    });

    test('with controllerContainerFirst, it comes before storage', () => {
        const room = aRoom().withRcl(4)
            .withStructure(STRUCTURE_STORAGE, 15, 15, { store: energy(5000, 1e6) })
            .withStructure(STRUCTURE_CONTAINER, 23, 23, { owner: 'none', store: energy(500, 2000) })
            .withMyCreep('c', 10, 10, { memory: mem() })
            .build();
        const [storage, controllerContainer] = room.structures;
        expect(gatherEnergy({ fromStores: true, controllerContainerFirst: true })(room.creepsPresent[0], room).action)
            .toEqual({ kind: 'move', creepName: 'c', target: controllerContainer.pos, range: 1 });
        expect(gatherEnergy({ fromStores: true })(room.creepsPresent[0], room).action)
            .toEqual({ kind: 'move', creepName: 'c', target: storage.pos, range: 1 });
    });

    test('creeps without WORK wait instead of upgrading when nothing needs energy', () => {
        const room = aRoom().withRcl(2).withMyCreep('c', 24, 24, { memory: mem(), activeParts: { [CARRY]: 1, [MOVE]: 1 } }).build();
        expect(deliverEnergy(room.creepsPresent[0], room)).toEqual({});
    });
});
