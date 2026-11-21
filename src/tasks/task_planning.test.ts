import { describe, expect, test } from '@jest/globals';
import { chooseMiningMode, findContainerTile, planTasks, PlanTasksInput } from './task_planning';
import { aRoom, RoomSnapshotBuilder } from 'testing/builders/room_snapshot_builder';
import { aBaseMemory } from 'testing/builders/context';
import { worldOf } from 'testing/builders/world';
import { MyCreepSnapshot } from 'snapshot/types';
import { TaskMemory } from './types';
import { MINER_COST } from './mine_task';
import { basePlanObjToBasePlanCoordString } from 'utils/string_utils';
import { RoomIntel } from 'intel/types';

function input(builder: RoomSnapshotBuilder, tasks: TaskMemory[] = [], overrides: Partial<PlanTasksInput> = {}): PlanTasksInput {
    const home = builder.build();
    return {
        world: worldOf([home]),
        home,
        baseMemory: aBaseMemory(),
        tasks,
        creepsByTask: new Map(),
        intel: {},
        unavailableRooms: [],
        ...overrides,
    };
}

const creepsIn = (taskName: string, count: number): [string, MyCreepSnapshot[]] =>
    [taskName, aRoom().withMyCreep('c', 1, 1).build().creepsPresent.flatMap(c => Array(count).fill(c))];

describe('chooseMiningMode', () => {
    const mine = (name: string): TaskMemory => ({ name, roomName: 'W1N1', type: 'mine', sourceId: 's' as Id<Source> });

    test('harvests until the room can afford a full miner', () => {
        expect(chooseMiningMode(aRoom().withEnergy(300, 300).build(), [], new Map())).toBe('harvest');
        expect(chooseMiningMode(aRoom().withEnergy(MINER_COST, MINER_COST).build(), [], new Map())).toBe('static');
    });

    test('stays static while a miner lives, even with little energy', () => {
        const home = aRoom().withEnergy(0, 800).build();
        expect(chooseMiningMode(home, [mine('m')], new Map([creepsIn('m', 1)]))).toBe('static');
    });

    test('falls back to harvesting on collapse: no miners and not enough energy for one', () => {
        const home = aRoom().withEnergy(MINER_COST - 1, 800).build();
        expect(chooseMiningMode(home, [mine('m')], new Map([creepsIn('m', 0)]))).toBe('harvest');
    });

    test('an already static base stays static if its capacity drops, while a miner lives', () => {
        const home = aRoom().withEnergy(0, 300).build();
        expect(chooseMiningMode(home, [mine('m')], new Map([creepsIn('m', 1)]))).toBe('static');
    });

    test('with no miners but enough energy, stays static (the miner spawns right away)', () => {
        const home = aRoom().withEnergy(MINER_COST, 800).build();
        expect(chooseMiningMode(home, [mine('m')], new Map())).toBe('static');
    });
});

describe('findContainerTile', () => {
    test('finds the planned container next to the source', () => {
        const layout = {
            2: [
                basePlanObjToBasePlanCoordString({ x: 15, y: 15 }, STRUCTURE_CONTAINER),
                basePlanObjToBasePlanCoordString({ x: 21, y: 20 }, STRUCTURE_ROAD),
                basePlanObjToBasePlanCoordString({ x: 21, y: 21 }, STRUCTURE_CONTAINER),
            ],
        };
        expect(findContainerTile(layout, { x: 20, y: 20, roomName: 'W1N1' })).toEqual({ x: 21, y: 21 });
        expect(findContainerTile(layout, { x: 40, y: 40, roomName: 'W1N1' })).toBeUndefined();
    });
});

describe('planTasks', () => {
    test('a new low-capacity base gets harvest per source, upgrade, build (with sites) and repair', () => {
        const i = input(aRoom().withRcl(1).withSource(10, 10).withSource(40, 40).withConstructionSite(STRUCTURE_ROAD, 5, 5));
        expect(planTasks(i)).toEqual({
            remove: [],
            create: [
                { type: 'harvest', sourceId: i.home.sources[0].id },
                { type: 'harvest', sourceId: i.home.sources[1].id },
                { type: 'upgrade' },
                { type: 'build' },
                { type: 'repair' },
            ],
        });
    });

    test('switches harvest to mine tasks (with container tiles) and adds a haul task once a miner is affordable', () => {
        const builder = aRoom().withRcl(2).withEnergy(MINER_COST, MINER_COST).withSource(20, 20);
        const sourceId = builder.build().sources[0].id;
        const tasks: TaskMemory[] = [
            { name: 'h', roomName: 'W1N1', type: 'harvest', sourceId },
            { name: 'u', roomName: 'W1N1', type: 'upgrade' },
            { name: 'r', roomName: 'W1N1', type: 'repair' },
            { name: 's', roomName: 'W1N1', type: 'scout' },
        ];
        const baseMemory = aBaseMemory({ baseLayout: { 2: [basePlanObjToBasePlanCoordString({ x: 21, y: 21 }, STRUCTURE_CONTAINER)] } });

        expect(planTasks(input(builder, tasks, { baseMemory }))).toEqual({
            remove: ['h'],
            create: [{ type: 'mine', sourceId, containerTile: { x: 21, y: 21 } }, { type: 'haul' }],
        });
    });

    test('on collapse, switches mine tasks back to harvest but keeps the haul task', () => {
        const builder = aRoom().withRcl(3).withEnergy(100, 800).withSource(20, 20);
        const sourceId = builder.build().sources[0].id;
        const tasks: TaskMemory[] = [
            { name: 'm', roomName: 'W1N1', type: 'mine', sourceId },
            { name: 'haul', roomName: 'W1N1', type: 'haul' },
            { name: 'u', roomName: 'W1N1', type: 'upgrade' },
            { name: 'r', roomName: 'W1N1', type: 'repair' },
            { name: 's', roomName: 'W1N1', type: 'scout' },
        ];
        expect(planTasks(input(builder, tasks))).toEqual({ remove: ['m'], create: [{ type: 'harvest', sourceId }] });
    });

    test('creates nothing that already exists', () => {
        const builder = aRoom().withRcl(1).withSource(10, 10).withConstructionSite(STRUCTURE_ROAD, 5, 5);
        const sourceId = builder.build().sources[0].id;
        const existing: TaskMemory[] = [
            { name: 'h', roomName: 'W1N1', type: 'harvest', sourceId },
            { name: 'u', roomName: 'W1N1', type: 'upgrade' },
            { name: 'b', roomName: 'W1N1', type: 'build' },
            { name: 'r', roomName: 'W1N1', type: 'repair' },
        ];
        expect(planTasks(input(builder, existing))).toEqual({ remove: [], create: [] });
    });

    test('adds a scout from RCL 2', () => {
        expect(planTasks(input(aRoom().withRcl(2))).create).toContainEqual({ type: 'scout' });
        expect(planTasks(input(aRoom().withRcl(1))).create).not.toContainEqual({ type: 'scout' });
    });

    test('adds remote mine tasks for good neighbors once static and rich enough', () => {
        const intel: RoomIntel = {
            lastSeen: 1, sources: [{ id: 'rs' as Id<Source>, x: 10, y: 10 }],
            controller: { x: 25, y: 25, level: 0 }, keeperLairs: 0, hostileCombatCreeps: 0,
        };
        const builder = aRoom().withRcl(3).withEnergy(800, 800).withSource(20, 20);
        const home = builder.build();
        const world = worldOf([home], { exits: { W1N1: ['W1N2', 'W2N1'] } });

        const changes = planTasks(input(builder, [], { world, intel: { W1N2: intel } }));
        expect(changes.create).toContainEqual({ type: 'remoteMine', targetRoom: 'W1N2' });

        // Not in harvest mode
        const poor = aRoom().withRcl(3).withEnergy(100, 300).withSource(20, 20);
        expect(planTasks(input(poor, [], { world, intel: { W1N2: intel } })).create.map(s => s.type)).not.toContain('remoteMine');
    });
});
