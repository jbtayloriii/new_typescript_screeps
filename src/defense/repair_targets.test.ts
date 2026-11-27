import { describe, expect, test } from '@jest/globals';
import { needsRepair, plannedWallTiles, repairTargetHits, WALL_TARGET_HITS_BY_RCL } from './repair_targets';
import { aRoom } from 'testing/builders/room_snapshot_builder';

describe('repairTargetHits', () => {
    const [road, wall] = aRoom()
        .withStructure(STRUCTURE_ROAD, 1, 1, { owner: 'none', hits: 100, hitsMax: 5000 })
        .withStructure(STRUCTURE_WALL, 2, 2, { owner: 'none', hits: 100, hitsMax: 3e8 })
        .build().structures;

    test('full hits for normal structures, an RCL-based target for walls', () => {
        expect(repairTargetHits(road, 3)).toBe(5000);
        expect(repairTargetHits(wall, 3)).toBe(WALL_TARGET_HITS_BY_RCL[3]);
        expect(repairTargetHits(wall, 0)).toBe(0);
    });

    test('needsRepair ignores structures owned by others', () => {
        const [enemy] = aRoom().withStructure(STRUCTURE_EXTENSION, 1, 1, { owner: 'other', hits: 1, hitsMax: 1000 }).build().structures;
        expect(needsRepair(road, 3, new Set())).toBe(true);
        expect(needsRepair(enemy, 3, new Set())).toBe(false);
    });

    test('needsRepair only counts walls the base layout plans', () => {
        expect(needsRepair(wall, 3, new Set())).toBe(false);
        expect(needsRepair(wall, 3, new Set(['2_2']))).toBe(true);
    });
});

describe('plannedWallTiles', () => {
    test('collects wall tiles from every layout level', () => {
        expect(plannedWallTiles({ 2: ['1_1_w', '3_3_r'], 5: ['4_4_w', '5_5_R'] })).toEqual(new Set(['1_1', '4_4']));
    });
});
