import { describe, expect, test } from '@jest/globals';
import {
    FIRST_MINER_PRIORITY, HARVESTER_BODY, HARVESTER_PRIORITY, isRetiring, MINER_BODY, mineTask,
    needsHauling, REPLACEMENT_MINER_PRIORITY,
} from './mine_task';
import { aRoom, energy, RoomSnapshotBuilder } from 'testing/builders/room_snapshot_builder';
import { aBaseMemory, aTaskContext } from 'testing/builders/context';
import { MineTaskMemory, TaskMemory } from './types';
import { WorkerState } from './behaviors';

const SOURCE = 'src1' as Id<Source>;
const TILE = { x: 21, y: 21 };
const minerParts = { [WORK]: 5, [MOVE]: 1 };
const miner = (extra = {}) => ({ memory: { taskName: 'm', baseRoomName: 'W1N1' }, activeParts: minerParts, ...extra });
const harvester = (extra: Partial<CreepMemory> = {}) =>
    ({ memory: { taskName: 'm', baseRoomName: 'W1N1', ...extra }, activeParts: { [WORK]: 1, [CARRY]: 1, [MOVE]: 1 } });
const task: MineTaskMemory = { name: 'm', roomName: 'W1N1', type: 'mine', sourceId: SOURCE, containerTile: TILE };
const haulTask: TaskMemory = { name: 'haul', roomName: 'W1N1', type: 'haul' };

/** A room with the source; `rich` rooms can afford a miner. */
function room(opts: { rich?: boolean, openSpots?: number } = {}): RoomSnapshotBuilder {
    const builder = aRoom().withRcl(2).withSource(20, 20, { id: SOURCE, openSpots: opts.openSpots ?? 8 });
    return opts.rich ? builder.withEnergy(550, 550) : builder.withEnergy(300, 300);
}

function ctx(builder: RoomSnapshotBuilder, t: MineTaskMemory = task) {
    const home = builder.build();
    return aTaskContext(home, {
        creeps: home.creepsPresent.filter(c => c.memory.taskName === t.name),
        baseTasks: [t, haulTask],
        baseMemory: aBaseMemory({ sourceDistances: { [SOURCE]: 10 } }),
    });
}

describe('isRetiring', () => {
    const creep = (ticksToLive?: number) => aRoom().withMyCreep('c', 1, 1, { activeParts: minerParts, ticksToLive }).build().creepsPresent[0];

    test('is true when remaining life is less than spawn time plus the walk', () => {
        // 6 parts × 3 ticks to spawn + 10 tiles × 5 ticks per tile = 68
        expect(isRetiring(creep(67), 10)).toBe(true);
        expect(isRetiring(creep(68), 10)).toBe(false);
        expect(isRetiring(creep(undefined), 10)).toBe(false);
    });
});

describe('mineTask.getSpawnRequests before a miner is affordable', () => {
    test('requests harvesters, the first urgent', () => {
        expect(mineTask.getSpawnRequests(task, ctx(room()))).toEqual([
            { taskName: 'm', priority: HARVESTER_PRIORITY, body: HARVESTER_BODY, urgent: true },
            { taskName: 'm', priority: HARVESTER_PRIORITY - 10, body: HARVESTER_BODY, urgent: false },
        ]);
    });

    test('never more harvesters than the source has open tiles', () => {
        expect(mineTask.getSpawnRequests(task, ctx(room({ openSpots: 1 })))).toHaveLength(1);
        expect(mineTask.getSpawnRequests(task, ctx(room({ openSpots: 1 }).withMyCreep('h', 19, 19, harvester())))).toEqual([]);
    });
});

describe('mineTask.getSpawnRequests once a miner is affordable', () => {
    test('requests the first miner at top priority when nobody works the source', () => {
        expect(mineTask.getSpawnRequests(task, ctx(room({ rich: true })))).toEqual([
            { taskName: 'm', priority: FIRST_MINER_PRIORITY, body: MINER_BODY },
        ]);
    });

    test('while harvesters work the source, the miner is a lower-priority replacement', () => {
        expect(mineTask.getSpawnRequests(task, ctx(room({ rich: true }).withMyCreep('h', 19, 19, harvester())))).toEqual([
            expect.objectContaining({ priority: REPLACEMENT_MINER_PRIORITY, body: MINER_BODY }),
        ]);
    });

    test('requests nothing while a miner has plenty of life left, and a replacement early', () => {
        expect(mineTask.getSpawnRequests(task, ctx(room({ rich: true }).withMyCreep('a', 21, 21, miner({ ticksToLive: 1000 }))))).toEqual([]);
        expect(mineTask.getSpawnRequests(task, ctx(room({ rich: true }).withMyCreep('a', 21, 21, miner({ ticksToLive: 30 }))))).toEqual([
            expect.objectContaining({ priority: REPLACEMENT_MINER_PRIORITY }),
        ]);
    });

    test('on collapse (nobody here, not enough energy for a miner), requests an urgent harvester', () => {
        const collapsed = aRoom().withRcl(3).withEnergy(100, 800).withSource(20, 20, { id: SOURCE });
        expect(mineTask.getSpawnRequests(task, ctx(collapsed))).toEqual([
            { taskName: 'm', priority: HARVESTER_PRIORITY, body: HARVESTER_BODY, urgent: true },
        ]);
    });
});

describe('mineTask.decide: harvesters', () => {
    test('walk their energy back while there is no container (or no hauler)', () => {
        const c = ctx(room().withSpawn(10, 10, { energy: 0 })
            .withMyCreep('h', 11, 11, { ...harvester({ state: WorkerState.WORKING }), store: energy(50) }));
        expect(mineTask.decide(task, c)).toContainEqual(
            { kind: 'transfer', creepName: 'h', targetId: c.home.structures[0].id, resource: RESOURCE_ENERGY });
    });

    test('park on the container and keep harvesting once a hauler exists, even when full', () => {
        const c = ctx(room().withStructure(STRUCTURE_CONTAINER, 21, 21, { owner: 'none' })
            .withMyCreep('h', 21, 21, { ...harvester({ state: WorkerState.WORKING }), store: energy(50) })
            .withMyCreep('hauler', 30, 30, { memory: { taskName: 'haul', baseRoomName: 'W1N1' } }));
        expect(mineTask.decide(task, c)).toEqual([{ kind: 'harvest', creepName: 'h', targetId: SOURCE }]);
    });

    test('without a hauler, a harvester on the container still delivers its own energy', () => {
        const c = ctx(room().withSpawn(10, 10, { energy: 0 }).withStructure(STRUCTURE_CONTAINER, 21, 21, { owner: 'none' })
            .withMyCreep('h', 21, 21, { ...harvester({ state: WorkerState.WORKING }), store: energy(50) }));
        expect(mineTask.decide(task, c)[0]).toMatchObject({ kind: 'move', creepName: 'h' });
    });

    test('only one harvester parks; the other keeps walking', () => {
        const c = ctx(room().withStructure(STRUCTURE_CONTAINER, 21, 21, { owner: 'none' })
            .withMyCreep('h1', 15, 15, harvester({ state: WorkerState.GATHERING }))
            .withMyCreep('h2', 21, 21, harvester({ state: WorkerState.GATHERING }))
            .withMyCreep('hauler', 30, 30, { memory: { taskName: 'haul', baseRoomName: 'W1N1' } }));
        const intents = mineTask.decide(task, c);
        // h2 is on the tile, so it parks; h1 walks to the source to harvest.
        expect(intents).toContainEqual({ kind: 'harvest', creepName: 'h2', targetId: SOURCE });
        expect(intents).toContainEqual(expect.objectContaining({ kind: 'move', creepName: 'h1', range: 1 }));
    });

    test('are released once a miner works the source', () => {
        const c = ctx(room({ rich: true }).withMyCreep('a', 21, 21, miner()).withMyCreep('h', 19, 19, harvester()));
        expect(mineTask.decide(task, c)).toContainEqual({ kind: 'setCreepMemory', creepName: 'h', patch: { taskName: '' } });
    });
});

describe('mineTask.decide: miners', () => {
    test('walk to the container tile, then harvest', () => {
        const walking = ctx(room({ rich: true }).withStructure(STRUCTURE_CONTAINER, 21, 21, { owner: 'none' }).withMyCreep('a', 10, 10, miner()));
        expect(mineTask.decide(task, walking)).toEqual([
            { kind: 'move', creepName: 'a', target: { x: 21, y: 21, roomName: 'W1N1' }, range: 0 },
        ]);
        const parked = ctx(room({ rich: true }).withStructure(STRUCTURE_CONTAINER, 21, 21, { owner: 'none' }).withMyCreep('a', 21, 21, miner()));
        expect(mineTask.decide(task, parked)).toEqual([{ kind: 'harvest', creepName: 'a', targetId: SOURCE }]);
    });

    test('a replacement mines from beside the tile while the old miner still holds it', () => {
        const c = ctx(room({ rich: true }).withStructure(STRUCTURE_CONTAINER, 21, 21, { owner: 'none' })
            .withMyCreep('old', 21, 21, miner()).withMyCreep('new', 19, 19, miner()));
        expect(mineTask.decide(task, c)).toEqual([
            { kind: 'harvest', creepName: 'old', targetId: SOURCE },
            { kind: 'harvest', creepName: 'new', targetId: SOURCE },
        ]);
    });

    test('without a known tile, mine from anywhere next to the source', () => {
        const c = ctx(room({ rich: true }).withMyCreep('a', 10, 10, miner()), { ...task, containerTile: undefined });
        expect(mineTask.decide({ ...task, containerTile: undefined }, c)).toEqual([
            { kind: 'move', creepName: 'a', target: c.home.sources[0].pos, range: 1 },
        ]);
    });

    test('wait instead of harvesting an empty source', () => {
        const c = ctx(aRoom().withRcl(2).withEnergy(550, 550).withSource(20, 20, { id: SOURCE, energy: 0 })
            .withStructure(STRUCTURE_CONTAINER, 21, 21, { owner: 'none' }).withMyCreep('a', 21, 21, miner()));
        expect(mineTask.decide(task, c)).toEqual([]);
    });
});

describe('mineTask container site', () => {
    const site = { kind: 'createConstructionSite', pos: { x: 21, y: 21, roomName: 'W1N1' }, structureType: STRUCTURE_CONTAINER };

    test('placed from RCL 2 when the container and its site are both missing', () => {
        expect(mineTask.decide(task, ctx(room()))).toEqual([site]);
        expect(mineTask.decide(task, ctx(room().withConstructionSite(STRUCTURE_CONTAINER, 21, 21)))).toEqual([]);
        const rcl1 = aRoom().withRcl(1).withSource(20, 20, { id: SOURCE });
        expect(mineTask.decide(task, ctx(rcl1))).toEqual([]);
    });
});

describe('needsHauling', () => {
    test('when the container exists or a miner works the source', () => {
        expect(needsHauling(task, room().build())).toBe(false);
        expect(needsHauling(task, room().withStructure(STRUCTURE_CONTAINER, 21, 21, { owner: 'none' }).build())).toBe(true);
        expect(needsHauling(task, room().withMyCreep('a', 19, 19, miner()).build())).toBe(true);
    });
});
