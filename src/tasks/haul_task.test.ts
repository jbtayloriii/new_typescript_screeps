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
