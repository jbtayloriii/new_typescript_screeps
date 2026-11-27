import { describe, expect, test } from '@jest/globals';
import { collectEnergy, FIRST_HAULER_PRIORITY, HAUL_BACKLOG, haulCarryNeeded, haulTask, mineBacklog } from './haul_task';
import { aRoom, energy } from 'testing/builders/room_snapshot_builder';
import { aBaseMemory, aTaskContext } from 'testing/builders/context';
import { MineTaskMemory, TaskMemory } from './types';
import { MyCreepSnapshot } from 'snapshot/types';
import { WorkerState } from './behaviors';

const hauler = (extra: Partial<CreepMemory> = {}) =>
    ({ memory: { taskName: 'haul', baseRoomName: 'W1N1', ...extra }, activeParts: { [CARRY]: 2, [MOVE]: 2 } });
const task = { name: 'haul', roomName: 'W1N1', type: 'haul' as const };

describe('haulCarryNeeded', () => {
    // Two sources whose containers exist, so both need hauling.
    const home = aRoom().withEnergy(800, 800)
        .withSource(10, 10, { id: 'a' as Id<Source> }).withSource(40, 40, { id: 'b' as Id<Source> })
        .withStructure(STRUCTURE_CONTAINER, 11, 11, { owner: 'none' })
        .withStructure(STRUCTURE_CONTAINER, 41, 41, { owner: 'none' })
        .build();
    const mine = (id: string, x: number): TaskMemory =>
        ({ name: id, roomName: 'W1N1', type: 'mine', sourceId: id as Id<Source>, containerTile: { x, y: x } });

    test('scales with the sources that need hauling and their distance', () => {
        const ctx = (distance: number) => aTaskContext(home, {
            baseTasks: [mine('a', 11), mine('b', 41)],
            baseMemory: aBaseMemory({ sourceDistances: { a: distance, b: distance } }),
        });
        // Distance 20: (2×20+4)×10/50 = 9 CARRY per source.
        expect(haulCarryNeeded(ctx(20))).toBe(18);
        expect(haulCarryNeeded(ctx(5))).toBe(6);
    });

    test('adds a full hauler of CARRY while a mine has a backlog', () => {
        const backedUp = aRoom().withEnergy(800, 800)
            .withSource(10, 10, { id: 'a' as Id<Source> })
            .withStructure(STRUCTURE_CONTAINER, 11, 11, { owner: 'none', store: energy(1000, 2000) })
            .withDrop(9, 9, HAUL_BACKLOG - 1000)
            .build();
        const ctx = aTaskContext(backedUp, { baseTasks: [mine('a', 11)], baseMemory: aBaseMemory({ sourceDistances: { a: 20 } }) });
        expect(mineBacklog(ctx.baseTasks[0] as MineTaskMemory, backedUp)).toBe(HAUL_BACKLOG);
        // 9 for the trip, plus 8 (800 capacity → 8 CARRY per hauler).
        expect(haulCarryNeeded(ctx)).toBe(17);
    });

    test('ignores sources whose harvesters still walk their energy home', () => {
        const noContainers = aRoom().withEnergy(800, 800).withSource(10, 10, { id: 'a' as Id<Source> }).build();
        expect(haulCarryNeeded(aTaskContext(noContainers, { baseTasks: [mine('a', 11)] }))).toBe(0);
        expect(haulCarryNeeded(aTaskContext(aRoom().build()))).toBe(0);
    });
});

describe('haulTask.getSpawnRequests', () => {
    const mineTask: TaskMemory = { name: 'm', roomName: 'W1N1', type: 'mine', sourceId: 'a' as Id<Source>, containerTile: { x: 11, y: 11 } };
    // Distance 25 (the default): (2×25+4)×10/50 = 11 CARRY needed; 800 capacity → 8 CARRY per hauler.
    const room = () => aRoom().withEnergy(800, 800).withSource(10, 10, { id: 'a' as Id<Source> })
        .withStructure(STRUCTURE_CONTAINER, 11, 11, { owner: 'none' });
    const requests = (creeps: Partial<MyCreepSnapshot>[]) => {
        const builder = room();
        creeps.forEach((c, i) => builder.withMyCreep(`h${i}`, 20, 20, { memory: { taskName: 'haul', baseRoomName: 'W1N1' }, ...c }));
        const home = builder.build();
        return haulTask.getSpawnRequests(task, aTaskContext(home, { baseTasks: [mineTask], creeps: home.creepsPresent }));
    };

    test('the first hauler is urgent and high priority', () => {
        expect(requests([])).toEqual([
            expect.objectContaining({ priority: FIRST_HAULER_PRIORITY, urgent: true }),
            expect.objectContaining({ urgent: false }),
        ]);
    });

    test('counts CARRY parts, so an undersized hauler gets help', () => {
        expect(requests([{ activeParts: { [CARRY]: 3, [MOVE]: 3 } }])).toEqual([expect.objectContaining({ urgent: false })]);
        expect(requests([{ activeParts: { [CARRY]: 11, [MOVE]: 11 } }])).toEqual([]);
    });

    test('replaces a retiring hauler early, without the urgent (undersized) body', () => {
        const big = { activeParts: { [CARRY]: 11, [MOVE]: 11 } };
        expect(requests([{ ...big, ticksToLive: 500 }])).toEqual([]);
        expect(requests([{ ...big, ticksToLive: 20 }])).toEqual([
            expect.objectContaining({ priority: FIRST_HAULER_PRIORITY, urgent: false }),
            expect.anything(),
        ]);
    });
});

describe('collectEnergy', () => {
    test('takes the pile with the most unclaimed energy', () => {
        const room = aRoom()
            .withStructure(STRUCTURE_CONTAINER, 30, 30, { owner: 'none', store: energy(800, 2000) })
            .withDrop(12, 12, 300)
            .withMyCreep('h', 10, 10, hauler())
            .build();
        const step = collectEnergy(room.creepsPresent)(room.creepsPresent[0], room);
        expect(step.memory).toEqual({ targetId: room.structures[0].id });
        expect(step.action).toMatchObject({ kind: 'move' });
    });

    test('skips energy other gathering haulers already claimed', () => {
        const builder = aRoom()
            .withStructure(STRUCTURE_CONTAINER, 30, 30, { owner: 'none', store: energy(100, 2000) })
            .withDrop(11, 11, 80)
            .withMyCreep('h', 10, 10, hauler());
        const containerId = builder.build().structures[0].id;
        const room = builder.withMyCreep('other', 29, 29, { ...hauler({ targetId: containerId, state: WorkerState.GATHERING }), store: energy(0, 100) }).build();

        expect(collectEnergy(room.creepsPresent)(room.creepsPresent[0], room)).toEqual({
            action: { kind: 'pickup', creepName: 'h', targetId: room.droppedResources[0].id },
            memory: { targetId: room.droppedResources[0].id },
        });
    });

    test('haulers sharing low piles settle on targets instead of all switching every tick', () => {
        // W24S31 history: two containers with little energy and several empty haulers all
        // switched to the other container together, then switched back the next tick, forever.
        const builder = aRoom()
            .withStructure(STRUCTURE_CONTAINER, 28, 36, { owner: 'none', store: energy(70, 2000) })
            .withStructure(STRUCTURE_CONTAINER, 38, 43, { owner: 'none', store: energy(60, 2000) });
        const [a, b] = builder.build().structures.map(s => s.id);
        const gathering = (store = energy(0, 500)) => ({ ...hauler({ targetId: a, state: WorkerState.GATHERING }), store });
        let room = builder
            .withMyCreep('h1', 31, 36, gathering())
            .withMyCreep('h2', 40, 31, gathering())
            .withMyCreep('h3', 29, 36, gathering(energy(490, 500)))
            .build();

        const targets: string[][] = [];
        for (let tick = 0; tick < 3; tick++) {
            const collect = collectEnergy(room.creepsPresent);
            const steps = room.creepsPresent.map(c => collect(c, room));
            room = { ...room, creepsPresent: room.creepsPresent.map((c, i) => ({ ...c, memory: { ...c.memory, ...steps[i].memory } })) };
            targets.push(steps.map(s => s.action ? (s.action as { targetId?: string }).targetId ?? 'move' : 'wait'));
        }
        // h1 keeps the first container, h2 takes the second, h3 waits: the same on every tick.
        expect(room.creepsPresent.map(c => c.memory.targetId)).toEqual([a, b, a]);
        expect(targets[1]).toEqual(targets[0]);
        expect(targets[2]).toEqual(targets[0]);
        expect(targets[0][2]).toBe('wait');
    });

    test('ignores small piles and the controller container', () => {
        const room = aRoom().withRcl(2)
            .withStructure(STRUCTURE_CONTAINER, 24, 24, { owner: 'none', store: energy(1000, 2000) })
            .withDrop(11, 11, 10)
            .withMyCreep('h', 10, 10, hauler())
            .build();
        expect(collectEnergy(room.creepsPresent)(room.creepsPresent[0], room)).toEqual({});
    });
});

describe('haulTask.decide', () => {
    test('a full hauler fills the spawn, and waits (no upgrading) when nothing needs energy', () => {
        const needy = aRoom().withSpawn(11, 11, { energy: 0 }).withMyCreep('h', 10, 10, { ...hauler({ state: WorkerState.WORKING }), store: energy(100, 100) }).build();
        expect(haulTask.decide(task, aTaskContext(needy))).toEqual([
            { kind: 'transfer', creepName: 'h', targetId: needy.structures[0].id, resource: RESOURCE_ENERGY },
            { kind: 'setCreepMemory', creepName: 'h', patch: { targetId: needy.structures[0].id } },
        ]);

        const full = aRoom().withRcl(2).withSpawn(11, 11, { energy: 300 }).withMyCreep('h', 10, 10, { ...hauler({ state: WorkerState.WORKING }), store: energy(100, 100) }).build();
        expect(haulTask.decide(task, aTaskContext(full))).toEqual([]);
    });
});
