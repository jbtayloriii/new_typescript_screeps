import { describe, expect, test } from '@jest/globals';
import { BaseLayoutMapObj } from './base_layout_map_obj';

describe('new module', () => {
    test('No base modules added', () => {
        const baseLayoutMapObj = new BaseLayoutMapObj(5);

        const serializedMap = baseLayoutMapObj.toSerializedMap();

        // expect(serializedMap.keys()).toHaveLength(8);
        expect(serializedMap.get(1)).toHaveLength(0);
        expect(serializedMap.get(2)).toHaveLength(0);
        expect(serializedMap.get(3)).toHaveLength(0);
        expect(serializedMap.get(4)).toHaveLength(0);
        expect(serializedMap.get(5)).toHaveLength(0);
        expect(serializedMap.get(6)).toHaveLength(0);
        expect(serializedMap.get(7)).toHaveLength(0);
        expect(serializedMap.get(8)).toHaveLength(0);

    });

    test('Added base modules', () => {
        const baseLayoutMapObj = new BaseLayoutMapObj(5);
        baseLayoutMapObj.addBuilding(1, { x: 1, y: 1 }, "road");
        baseLayoutMapObj.addBuilding(1, { x: 2, y: 1 }, "road");
        baseLayoutMapObj.addBuilding(4, { x: 3, y: 3 }, "storage");

        const serializedMap = baseLayoutMapObj.toSerializedMap();

        const levelOnePlans = serializedMap.get(1);
        expect(levelOnePlans).toHaveLength(2);
        expect(levelOnePlans).toContain("1_1_road");
        expect(levelOnePlans).toContain("2_1_road");

        const levelFourPlans = serializedMap.get(4);
        expect(levelFourPlans).toHaveLength(1);
        expect(levelFourPlans).toContain("3_3_storage");
    });

    test('Adding to level too low', () => {
        const baseLayoutMapObj = new BaseLayoutMapObj(5);
        expect(() =>
            baseLayoutMapObj.addBuilding(0, { x: 1, y: 1 }, STRUCTURE_CONTAINER)
        ).toThrow(Error);
    });

    test('Adding to level too high', () => {
        const baseLayoutMapObj = new BaseLayoutMapObj(5);
        expect(() =>
            baseLayoutMapObj.addBuilding(9, { x: 1, y: 1 }, STRUCTURE_CONTAINER)
        ).toThrow(Error);

    });
});
