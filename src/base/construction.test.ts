import { describe, expect, test } from '@jest/globals';
import { LAYOUT_REPLAN_INTERVAL, planConstruction } from './construction';
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

        expect(plan.intents.map(i => i.structureType)).toEqual([STRUCTURE_EXTENSION, STRUCTURE_ROAD, STRUCTURE_TOWER]);
        expect(plan.memoryUpdate.currentControllerLevelPlan).toBe(3);
    });

    test('a different structure on the same spot does not block a planned one', () => {
        const room = aRoom().withRcl(2).withTick(5000).withSpawn(10, 10)
            .withStructure(STRUCTURE_ROAD, 12, 12, { owner: 'none' }).build();
        expect(planConstruction(room, baseMemory()).intents.map(i => i.structureType))
            .toEqual([STRUCTURE_EXTENSION, STRUCTURE_ROAD]);
    });
});
