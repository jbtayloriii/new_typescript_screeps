import { describe, expect, test } from '@jest/globals';
import { BaseLayoutMapObj, getLayoutCoordsBetweenLevels } from './base_layout_map_obj';
import { basePlanObjToBasePlanCoordString } from '../utils/string_utils';

describe('new module', () => {
    test('No base modules added', () => {
        const baseLayoutMapObj = new BaseLayoutMapObj(5);

        const serializedMap = baseLayoutMapObj.toSerializedMap();

        expect(Object.keys(serializedMap)).toHaveLength(8);
        expect(serializedMap[1]).toHaveLength(0);
        expect(serializedMap[2]).toHaveLength(0);
        expect(serializedMap[3]).toHaveLength(0);
        expect(serializedMap[4]).toHaveLength(0);
        expect(serializedMap[5]).toHaveLength(0);
        expect(serializedMap[6]).toHaveLength(0);
        expect(serializedMap[7]).toHaveLength(0);
        expect(serializedMap[8]).toHaveLength(0);

    });

    test('Added base modules', () => {
        const baseLayoutMapObj = new BaseLayoutMapObj(5);
        baseLayoutMapObj.addBuilding(1, { x: 1, y: 1 }, STRUCTURE_ROAD);
        baseLayoutMapObj.addBuilding(1, { x: 2, y: 1 }, STRUCTURE_ROAD);
        baseLayoutMapObj.addBuilding(4, { x: 3, y: 3 }, STRUCTURE_STORAGE);

        const serializedMap = baseLayoutMapObj.toSerializedMap();

        const levelOnePlans = serializedMap[1];
        expect(levelOnePlans).toHaveLength(2);
        expect(levelOnePlans).toContain(basePlanObjToBasePlanCoordString({ x: 1, y: 1 }, STRUCTURE_ROAD));
        expect(levelOnePlans).toContain(basePlanObjToBasePlanCoordString({ x: 2, y: 1 }, STRUCTURE_ROAD));

        const levelFourPlans = serializedMap[4];
        expect(levelFourPlans).toHaveLength(1);
        expect(levelFourPlans).toContain(basePlanObjToBasePlanCoordString({ x: 3, y: 3 }, STRUCTURE_STORAGE));
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

    test('Serialized map survives a JSON round trip (as Memory does)', () => {
        const baseLayoutMapObj = new BaseLayoutMapObj(5);
        baseLayoutMapObj.addBuilding(1, { x: 1, y: 1 }, STRUCTURE_ROAD);
        baseLayoutMapObj.addBuilding(4, { x: 3, y: 3 }, STRUCTURE_STORAGE);

        const roundTripped = JSON.parse(JSON.stringify(baseLayoutMapObj.toSerializedMap()));

        expect(roundTripped).toEqual(baseLayoutMapObj.toSerializedMap());
        expect(roundTripped[4]).toContain(basePlanObjToBasePlanCoordString({ x: 3, y: 3 }, STRUCTURE_STORAGE));
    });
});

describe('getLayoutCoordsBetweenLevels', () => {
    const layout = { 1: ['a'], 2: ['b', 'c'], 3: [], 4: ['d'] };

    test('returns levels in (from, to]', () => {
        expect(getLayoutCoordsBetweenLevels(layout, 1, 4)).toEqual(['b', 'c', 'd']);
    });

    test('returns nothing when the level has not increased', () => {
        expect(getLayoutCoordsBetweenLevels(layout, 4, 4)).toEqual([]);
    });

    test('starts from level 1 when nothing has been planned yet', () => {
        expect(getLayoutCoordsBetweenLevels(layout, 0, 2)).toEqual(['a', 'b', 'c']);
    });

    test('ignores missing levels', () => {
        expect(getLayoutCoordsBetweenLevels(layout, 4, 8)).toEqual([]);
    });
});
