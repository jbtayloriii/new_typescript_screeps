import { describe, expect, test } from '@jest/globals';
import { LAYOUT_REPLAN_INTERVAL, MAX_SITES_PER_ROOM, planConstruction, ROAD_MIN_RCL } from './construction';
import { aRoom } from 'testing/builders/room_snapshot_builder';
import { basePlanObjToBasePlanCoordString } from 'utils/string_utils';

const coord = (x: number, y: number, s: BuildableStructureConstant) => basePlanObjToBasePlanCoordString({ x, y }, s);

function baseMemory(overrides: Partial<BaseMemory> = {}): BaseMemory {
    return {
        currentControllerLevelPlan: 2,
        lastBaseLayoutPlanTick: 1000,
        initialSpawn: '10_10',
        baseLayout: {
            1: [coord(10, 10, STRUCTURE_SPAWN)],
            2: [coord(12, 12, STRUCTURE_EXTENSION), coord(13, 13, STRUCTURE_ROAD)],
            3: [coord(14, 14, STRUCTURE_TOWER)],
        },
        ...overrides,
    };
}

describe('planConstruction', () => {
    test('waits until the replan interval has passed', () => {
        const room = aRoom().withRcl(2).withTick(1000 + LAYOUT_REPLAN_INTERVAL - 1).build();
        expect(planConstruction(room, baseMemory())).toEqual({ intents: [], memoryUpdate: {} });
    });

    test('places every unlocked level, skipping built structures and existing sites', () => {
        const room = aRoom().withRcl(2).withTick(1000 + LAYOUT_REPLAN_INTERVAL)
            .withSpawn(10, 10)
            .withConstructionSite(STRUCTURE_ROAD, 13, 13)
            .build();

        expect(planConstruction(room, baseMemory())).toEqual({
            intents: [{ kind: 'createConstructionSite', pos: { x: 12, y: 12, roomName: 'W1N1' }, structureType: STRUCTURE_EXTENSION }],
            memoryUpdate: { currentControllerLevelPlan: 2, lastBaseLayoutPlanTick: 1000 + LAYOUT_REPLAN_INTERVAL },
        });
    });

    test('plans right away after a level-up', () => {
        const room = aRoom().withRcl(3).withTick(1001).withSpawn(10, 10).build();
        const plan = planConstruction(room, baseMemory());

        // Placed in build priority order, not layout order
        expect(plan.intents.map(i => i.structureType)).toEqual([STRUCTURE_EXTENSION, STRUCTURE_TOWER, STRUCTURE_ROAD]);
        expect(plan.memoryUpdate.currentControllerLevelPlan).toBe(3);
    });

    test('a different structure on the same spot does not block a planned one', () => {
        const room = aRoom().withRcl(3).withTick(5000).withSpawn(10, 10)
            .withStructure(STRUCTURE_ROAD, 12, 12, { owner: 'none' }).build();
        expect(planConstruction(room, baseMemory()).intents.map(i => i.structureType))
            .toEqual([STRUCTURE_EXTENSION, STRUCTURE_TOWER, STRUCTURE_ROAD]);
    });

    test(`places no roads before RCL ${ROAD_MIN_RCL}`, () => {
        const layout = { 1: [coord(5, 5, STRUCTURE_ROAD)], 2: [coord(20, 20, STRUCTURE_EXTENSION), coord(6, 6, STRUCTURE_ROAD)] };
        const placed = (rcl: number) => planConstruction(aRoom().withRcl(rcl).withTick(5000).build(), baseMemory({ baseLayout: layout }))
            .intents.map(i => i.structureType);
        expect(placed(1)).toEqual([]);
        expect(placed(ROAD_MIN_RCL - 1)).toEqual([STRUCTURE_EXTENSION]);
        expect(placed(ROAD_MIN_RCL)).toEqual([STRUCTURE_EXTENSION, STRUCTURE_ROAD, STRUCTURE_ROAD]);
    });

    test('caps sites per priority tier: lower-priority sites never block more important ones', () => {
        const layout = {
            2: [
                ...Array.from({ length: 10 }, (_, i) => coord(20 + i, 20, STRUCTURE_EXTENSION)),
                coord(5, 5, STRUCTURE_ROAD),
            ],
        };
        // Old road sites fill the cap, but extensions are still placed (up to the cap).
        const roads = aRoom().withRcl(2).withTick(5000);
        for (let i = 0; i < MAX_SITES_PER_ROOM; i++) roads.withConstructionSite(STRUCTURE_ROAD, 1, i);
        const plan = planConstruction(roads.build(), baseMemory({ baseLayout: layout }));
        expect(plan.intents.map(i => i.structureType)).toEqual(Array(MAX_SITES_PER_ROOM).fill(STRUCTURE_EXTENSION));
        expect(plan.memoryUpdate.lastBaseLayoutPlanTick).toBe(5000);

        // An existing extension site counts against the extensions' cap, and every site
        // (all at least as important as a road) blocks the new road.
        const oneExtension = aRoom().withRcl(2).withTick(5000).withConstructionSite(STRUCTURE_EXTENSION, 40, 40).build();
        expect(planConstruction(oneExtension, baseMemory({ baseLayout: layout })).intents.map(i => i.structureType))
            .toEqual(Array(MAX_SITES_PER_ROOM - 1).fill(STRUCTURE_EXTENSION));
    });

    test('places lower-priority sites when the more important ones leave room', () => {
        const layout = { 2: [coord(20, 20, STRUCTURE_EXTENSION), coord(5, 5, STRUCTURE_ROAD), coord(6, 6, STRUCTURE_ROAD)] };
        const room = aRoom().withRcl(3).withTick(5000).build();
        expect(planConstruction(room, baseMemory({ baseLayout: layout })).intents.map(i => i.structureType))
            .toEqual([STRUCTURE_EXTENSION, STRUCTURE_ROAD, STRUCTURE_ROAD]);
    });

    test('adds the controller container from RCL 2', () => {
        const room = aRoom().withRcl(2).withTick(5000).withSpawn(10, 10).build();
        const memory = baseMemory({ baseLayout: {}, controllerContainer: { x: 23, y: 23 } });
        expect(planConstruction(room, memory).intents).toEqual([
            { kind: 'createConstructionSite', pos: { x: 23, y: 23, roomName: 'W1N1' }, structureType: STRUCTURE_CONTAINER },
        ]);
        expect(planConstruction(aRoom().withRcl(1).withTick(5000).build(), memory).intents).toEqual([]);
    });
});
