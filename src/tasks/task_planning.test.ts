import { describe, expect, test } from '@jest/globals';
import { findContainerTile, planTasks, PlanTasksInput } from './task_planning';
import { aRoom, RoomSnapshotBuilder } from 'testing/builders/room_snapshot_builder';
import { aBaseMemory } from 'testing/builders/context';
import { worldOf } from 'testing/builders/world';
import { MyCreepSnapshot } from 'snapshot/types';
import { TaskMemory } from './types';
import { MINER_COST } from './mine_task';
import { basePlanObjToBasePlanCoordString } from 'utils/string_utils';
import { Directive } from 'directives/types';

function input(builder: RoomSnapshotBuilder, tasks: TaskMemory[] = [], overrides: Partial<PlanTasksInput> = {}): PlanTasksInput {
    const home = builder.build();
    return {
        world: worldOf([home]),
        home,
        baseMemory: aBaseMemory(),
        tasks,
        creepsByTask: new Map(),
        intel: {},
        directives: [],
        ...overrides,
    };
}

const creepsIn = (taskName: string, count: number): [string, MyCreepSnapshot[]] =>
    [taskName, aRoom().withMyCreep('c', 1, 1).build().creepsPresent.flatMap(c => Array(count).fill(c))];

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
    test('a new base gets a mine task per source (with its container tile), upgrade, build (with sites) and repair', () => {
        const baseMemory = aBaseMemory({ baseLayout: { 2: [basePlanObjToBasePlanCoordString({ x: 11, y: 11 }, STRUCTURE_CONTAINER)] } });
        const i = input(aRoom().withRcl(1).withSource(10, 10).withSource(40, 40).withConstructionSite(STRUCTURE_ROAD, 5, 5), [], { baseMemory });
        expect(planTasks(i)).toEqual({
            remove: [],
            create: [
                { type: 'mine', sourceId: i.home.sources[0].id, containerTile: { x: 11, y: 11 } },
                { type: 'mine', sourceId: i.home.sources[1].id, containerTile: undefined },
                { type: 'upgrade' },
                { type: 'build' },
                { type: 'repair' },
            ],
        });
    });

    test('adds a haul task once a source needs hauling: its container exists, or a miner works it', () => {
        const sourceId = 'src1' as Id<Source>;
        const base = () => aRoom().withRcl(2).withSource(20, 20, { id: sourceId });
        const tasks: TaskMemory[] = [
            { name: 'm', roomName: 'W1N1', type: 'mine', sourceId, containerTile: { x: 21, y: 21 } },
            { name: 'u', roomName: 'W1N1', type: 'upgrade' },
            { name: 'r', roomName: 'W1N1', type: 'repair' },
            { name: 's', roomName: 'W1N1', type: 'scout' },
        ];
        expect(planTasks(input(base(), tasks)).create).toEqual([]);
        expect(planTasks(input(base().withStructure(STRUCTURE_CONTAINER, 21, 21, { owner: 'none' }), tasks)).create).toEqual([{ type: 'haul' }]);
        const miner = { memory: { taskName: 'm', baseRoomName: 'W1N1' }, activeParts: { [WORK]: 5, [MOVE]: 1 } };
        expect(planTasks(input(base().withMyCreep('miner', 21, 21, miner), tasks)).create).toEqual([{ type: 'haul' }]);
    });

    test('creates nothing that already exists', () => {
        const builder = aRoom().withRcl(1).withSource(10, 10).withConstructionSite(STRUCTURE_ROAD, 5, 5);
        const sourceId = builder.build().sources[0].id;
        const existing: TaskMemory[] = [
            { name: 'h', roomName: 'W1N1', type: 'mine', sourceId },
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

    test('creates one task per active directive and drops tasks whose directive ended', () => {
        const directive = (id: string, type: Directive['type'], targetRoom: string): Directive =>
            ({ id, type, targetRoom, source: 'manual', status: 'active', createdAt: 1, baseRoomName: 'W1N1' });
        const tasks: TaskMemory[] = [
            { name: 'u', roomName: 'W1N1', type: 'upgrade' },
            { name: 'r', roomName: 'W1N1', type: 'repair' },
            { name: 'old', roomName: 'W1N1', type: 'remoteMine', targetRoom: 'W1N3', directiveId: 'gone' },
            { name: 'legacy', roomName: 'W1N1', type: 'remoteMine', targetRoom: 'W1N4' },
            { name: 'keep', roomName: 'W1N1', type: 'claim', targetRoom: 'W3N3', directiveId: 'd3' },
        ];
        const changes = planTasks(input(aRoom().withRcl(1), tasks, {
            directives: [directive('d1', 'remoteMine', 'W1N2'), directive('d2', 'scout', 'W9N9'), directive('d3', 'claim', 'W3N3')],
        }));

        expect(changes.remove).toEqual(['old', 'legacy']);
        expect(changes.create).toEqual([
            { type: 'remoteMine', targetRoom: 'W1N2', directiveId: 'd1' },
            { type: 'scout', targetRoom: 'W9N9', directiveId: 'd2' },
        ]);
    });

    test('military directives get a squad task with their mission', () => {
        const attack: Directive = { id: 'd5', type: 'attack', targetRoom: 'W3N3', source: 'manual', status: 'active', createdAt: 1, baseRoomName: 'W1N1' };
        expect(planTasks(input(aRoom().withRcl(1), [], { directives: [attack] })).create)
            .toContainEqual({ type: 'squad', mission: 'attack', targetRoom: 'W3N3', directiveId: 'd5' });
        const stale: TaskMemory = { name: 'sq', roomName: 'W1N1', type: 'squad', mission: 'defend', targetRoom: 'W1N2', directiveId: 'gone' };
        expect(planTasks(input(aRoom().withRcl(1), [stale])).remove).toContain('sq');
    });

    test("a directive scout doesn't replace the routine scout", () => {
        const tasks: TaskMemory[] = [{ name: 's', roomName: 'W1N1', type: 'scout', targetRoom: 'W9N9', directiveId: 'd1' }];
        expect(planTasks(input(aRoom().withRcl(2), tasks)).create).toContainEqual({ type: 'scout' });
    });
});
