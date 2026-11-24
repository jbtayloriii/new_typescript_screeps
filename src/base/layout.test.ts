import { describe, expect, test } from '@jest/globals';
import { mockInstanceOf } from 'screeps-jest';
import { LAYOUT_VERSION } from 'pathfinding/base_layout_utils';
import { layoutInputFor, loadTestRoom } from 'pathfinding/testdata/test_rooms';
import { needsReplan, REPLAN_MIN_BUCKET, replanIfOutdated } from './layout';

/** A mock Room for a test room, with the given structures built. */
function mockRoom(name: RoomName, structures: { x: number, y: number, structureType: StructureConstant }[] = []): Room {
    layoutInputFor(name); // loads the room into the mock PathFinder
    const data = loadTestRoom(name);
    const pos = (c: { x: number, y: number }) => ({ x: c.x, y: c.y, roomName: name });
    return mockInstanceOf<Room>({
        name,
        controller: data.controller ? mockInstanceOf<StructureController>({ pos: pos(data.controller) }) : undefined,
        getTerrain: () => mockInstanceOf<RoomTerrain>({ get: (x: number, y: number) => data.terrainGrid[y][x] }),
        find: (type: FindConstant) => {
            if (type === FIND_SOURCES) return data.sources.map(s => ({ pos: pos(s) }));
            if (type === FIND_MINERALS) return data.mineral ? [{ pos: pos(data.mineral) }] : [];
            if (type === FIND_STRUCTURES) return structures.map(s => ({ pos: pos(s), structureType: s.structureType }));
            return [];
        },
    });
}

function v1Base(overrides: Partial<BaseMemory> = {}): BaseMemory {
    return {
        currentControllerLevelPlan: 5,
        lastBaseLayoutPlanTick: 1234,
        initialSpawn: '30_18',
        baseLayout: { 1: ['30_18_s'] },
        controllerContainer: { x: 31, y: 8 },
        ...overrides,
    };
}

describe('replanIfOutdated', () => {
    test('a base without a layout version is out of date', () => {
        expect(needsReplan(v1Base())).toBe(true);
        expect(needsReplan(v1Base({ layoutVersion: LAYOUT_VERSION }))).toBe(false);
    });

    test('replans a v1 base, keeping its controller container, and places sites right away', () => {
        const memory = v1Base();
        const room = mockRoom('W23S31', [{ x: 30, y: 18, structureType: STRUCTURE_SPAWN }]);
        expect(replanIfOutdated(room, memory, 100, 10000)).toBe(true);
        expect(memory.layoutVersion).toBe(LAYOUT_VERSION);
        expect(memory.layoutWarnings).toEqual([]);
        expect(memory.controllerContainer).toEqual({ x: 31, y: 8 });
        expect(memory.lastBaseLayoutPlanTick).toBe(0);
        expect(Object.values(memory.baseLayout).flat()).toContain('31_8_c');
        expect(memory.baseLayout[1]).toContain('30_18_s');
    });

    test('replans one base per tick', () => {
        const room = mockRoom('W23S31');
        const first = v1Base();
        const second = v1Base();
        expect(replanIfOutdated(room, first, 200, 10000)).toBe(true);
        expect(replanIfOutdated(room, second, 200, 10000)).toBe(false);
        expect(second.layoutVersion).toBeUndefined();
        expect(replanIfOutdated(room, second, 201, 10000)).toBe(true);
    });

    test('keeps the old layout if planning fails, and does not retry', () => {
        // No core fits next to a spawn in a corner of walls.
        const memory = v1Base({ initialSpawn: '1_1' });
        expect(replanIfOutdated(mockRoom('W23S31'), memory, 300, 10000)).toBe(true);
        expect(memory.baseLayout).toEqual({ 1: ['30_18_s'] });
        expect(memory.layoutWarnings?.[0]).toMatch(/^replan failed/);
        expect(needsReplan(memory)).toBe(false);
    });

    test('waits for the CPU bucket', () => {
        const memory = v1Base();
        expect(replanIfOutdated(mockRoom('W23S31'), memory, 400, REPLAN_MIN_BUCKET - 1)).toBe(false);
        expect(needsReplan(memory)).toBe(true);
        expect(replanIfOutdated(mockRoom('W23S31'), memory, 401, REPLAN_MIN_BUCKET)).toBe(true);
    });

    test('an unexpected error keeps the old layout instead of throwing every tick', () => {
        const memory = v1Base();
        const broken = mockInstanceOf<Room>({ name: 'W23S31', getTerrain: () => { throw new Error('unexpected'); } });
        expect(replanIfOutdated(broken, memory, 500, 10000)).toBe(true);
        expect(memory.layoutWarnings).toEqual(['replan failed, kept the old layout: unexpected']);
        expect(memory.baseLayout).toEqual({ 1: ['30_18_s'] });
        expect(needsReplan(memory)).toBe(false);
    });
});
