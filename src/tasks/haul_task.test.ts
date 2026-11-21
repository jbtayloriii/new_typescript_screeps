import { describe, expect, test } from '@jest/globals';
import { collectEnergy, desiredHaulerCount, FIRST_HAULER_PRIORITY, haulTask } from './haul_task';
import { aRoom, energy } from 'testing/builders/room_snapshot_builder';
import { aBaseMemory, aTaskContext } from 'testing/builders/context';
import { TaskMemory } from './types';
import { WorkerState } from './behaviors';

const hauler = (extra: Partial<CreepMemory> = {}) =>
    ({ memory: { taskName: 'haul', baseRoomName: 'W1N1', ...extra }, activeParts: { [CARRY]: 2, [MOVE]: 2 } });
const task = { name: 'haul', roomName: 'W1N1', type: 'haul' as const };

describe('desiredHaulerCount', () => {
    // Two sources whose containers exist, so both need hauling.
    const home = aRoom().withEnergy(800, 800)
        .withSource(10, 10, { id: 'a' as Id<Source> }).withSource(40, 40, { id: 'b' as Id<Source> })
        .withStructure(STRUCTURE_CONTAINER, 11, 11, { owner: 'none' })
        .withStructure(STRUCTURE_CONTAINER, 41, 41, { owner: 'none' })
        .build();
    const mine = (id: string, x: number): TaskMemory =>
        ({ name: id, roomName: 'W1N1', type: 'mine', sourceId: id as Id<Source>, containerTile: { x, y: x } });

    test('scales with the sources that need hauling, their distance, and hauler size', () => {
        const ctx = (distance: number, capacity = 800) => aTaskContext({ ...home, energyCapacityAvailable: capacity }, {
            baseTasks: [mine('a', 11), mine('b', 41)],
            baseMemory: aBaseMemory({ sourceDistances: { a: distance, b: distance } }),
        });
        // 800 capacity → 8 CARRY per hauler. Distance 20: (2×20+4)×10/50 = 9 CARRY per source → 18 → 3 haulers.
        expect(desiredHaulerCount(ctx(20))).toBe(3);
        expect(desiredHaulerCount(ctx(5))).toBe(1);
        // Capped at 2 per source + 1
        expect(desiredHaulerCount(ctx(20, 200))).toBe(5);
    });

    test('ignores sources whose harvesters still walk their energy home', () => {
        const noContainers = aRoom().withEnergy(800, 800).withSource(10, 10, { id: 'a' as Id<Source> }).build();
        expect(desiredHaulerCount(aTaskContext(noContainers, { baseTasks: [mine('a', 11)] }))).toBe(0);
        expect(desiredHaulerCount(aTaskContext(aRoom().build()))).toBe(0);
    });
});

describe('haulTask.getSpawnRequests', () => {
    test('the first hauler is urgent and high priority', () => {
        const ctx = aTaskContext(home(), { baseTasks: [{ name: 'm', roomName: 'W1N1', type: 'mine', sourceId: 'a' as Id<Source>, containerTile: { x: 11, y: 11 } }] });
        expect(haulTask.getSpawnRequests(task, ctx)[0]).toMatchObject({ priority: FIRST_HAULER_PRIORITY, urgent: true });

        function home() {
            return aRoom().withEnergy(800, 800).withSource(10, 10, { id: 'a' as Id<Source> })
                .withStructure(STRUCTURE_CONTAINER, 11, 11, { owner: 'none' }).build();
        }
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
