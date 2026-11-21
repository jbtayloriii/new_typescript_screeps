import { describe, expect, test } from '@jest/globals';
import { FIRST_MINER_PRIORITY, isRetiring, MINER_BODY, mineTask, REPLACEMENT_MINER_PRIORITY } from './mine_task';
import { aRoom, RoomSnapshotBuilder } from 'testing/builders/room_snapshot_builder';
import { aBaseMemory, aTaskContext } from 'testing/builders/context';
import { MineTaskMemory } from './types';

const minerParts = { [WORK]: 5, [MOVE]: 1 };
const miner = (taskName = 'm') => ({ memory: { taskName, baseRoomName: 'W1N1' }, activeParts: minerParts });

function setup(builder: RoomSnapshotBuilder, tile: { x: number, y: number } | null = { x: 21, y: 21 }) {
    const home = builder.build();
    const task: MineTaskMemory = { name: 'm', roomName: 'W1N1', type: 'mine', sourceId: home.sources[0].id, containerTile: tile ?? undefined };
    return { home, task, ctx: aTaskContext(home, { baseMemory: aBaseMemory({ sourceDistances: { [home.sources[0].id]: 10 } }) }) };
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

describe('mineTask.getSpawnRequests', () => {
    test('requests the first miner at top priority', () => {
        const { task, ctx } = setup(aRoom().withSource(20, 20));
        expect(mineTask.getSpawnRequests(task, ctx)).toEqual([{ taskName: 'm', priority: FIRST_MINER_PRIORITY, body: MINER_BODY }]);
    });

    test('requests nothing while a miner has plenty of life left', () => {
        const { task, ctx } = setup(aRoom().withSource(20, 20).withMyCreep('a', 21, 21, { ...miner(), ticksToLive: 1000 }));
        expect(mineTask.getSpawnRequests(task, ctx)).toEqual([]);
    });

    test('requests a replacement early for a retiring miner', () => {
        const { task, ctx } = setup(aRoom().withSource(20, 20).withMyCreep('a', 21, 21, { ...miner(), ticksToLive: 30 }));
        expect(mineTask.getSpawnRequests(task, ctx)).toEqual([
            expect.objectContaining({ priority: REPLACEMENT_MINER_PRIORITY }),
        ]);
    });
});

describe('mineTask.decide', () => {
    test('walks to the container tile, then harvests', () => {
        const walking = setup(aRoom().withSource(20, 20).withStructure(STRUCTURE_CONTAINER, 21, 21, { owner: 'none' })
            .withMyCreep('a', 10, 10, miner()));
        expect(mineTask.decide(walking.task, walking.ctx)).toEqual([
            { kind: 'move', creepName: 'a', target: { x: 21, y: 21, roomName: 'W1N1' }, range: 0 },
        ]);

        const parked = setup(aRoom().withSource(20, 20).withStructure(STRUCTURE_CONTAINER, 21, 21, { owner: 'none' })
            .withMyCreep('a', 21, 21, miner()));
        expect(mineTask.decide(parked.task, parked.ctx)).toEqual([
            { kind: 'harvest', creepName: 'a', targetId: parked.task.sourceId },
        ]);
    });

    test('places a container site when the container and its site are both missing (drop mining meanwhile)', () => {
        const { task, ctx } = setup(aRoom().withSource(20, 20).withMyCreep('a', 21, 21, miner()));
        expect(mineTask.decide(task, ctx)).toEqual([
            { kind: 'harvest', creepName: 'a', targetId: task.sourceId },
            { kind: 'createConstructionSite', pos: { x: 21, y: 21, roomName: 'W1N1' }, structureType: STRUCTURE_CONTAINER },
        ]);

        const withSite = setup(aRoom().withSource(20, 20).withConstructionSite(STRUCTURE_CONTAINER, 21, 21));
        expect(mineTask.decide(withSite.task, withSite.ctx)).toEqual([]);
    });

    test('a replacement mines from beside the tile while the old miner still holds it', () => {
        const { task, ctx } = setup(aRoom().withSource(20, 20).withStructure(STRUCTURE_CONTAINER, 21, 21, { owner: 'none' })
            .withMyCreep('old', 21, 21, miner()).withMyCreep('new', 19, 19, miner()));
        expect(mineTask.decide(task, ctx)).toEqual([
            { kind: 'harvest', creepName: 'old', targetId: task.sourceId },
            { kind: 'harvest', creepName: 'new', targetId: task.sourceId },
        ]);
    });

    test('without a known tile, mines from anywhere next to the source', () => {
        const { task, ctx } = setup(aRoom().withSource(20, 20).withMyCreep('a', 10, 10, miner()), null);
        expect(mineTask.decide(task, ctx)).toEqual([
            { kind: 'move', creepName: 'a', target: ctx.home.sources[0].pos, range: 1 },
        ]);
    });

    test('waits instead of harvesting an empty source', () => {
        const { task, ctx } = setup(aRoom().withSource(20, 20, { energy: 0 }).withStructure(STRUCTURE_CONTAINER, 21, 21, { owner: 'none' })
            .withMyCreep('a', 21, 21, miner()));
        expect(mineTask.decide(task, ctx)).toEqual([]);
    });
});
