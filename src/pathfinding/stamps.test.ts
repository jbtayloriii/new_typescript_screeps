import { describe, expect, test } from '@jest/globals';
import { assignStamps, LAB_INPUTS, LAB_STAMP, mirroredLabStamp, SPAWN_STAMP, STAMP_ORDER, StampAssignment, stampTiles, TOWER_STAMP } from './stamps';

const ext = (level: number): StampAssignment => ({ kind: 'extension', level });
const describeAll = (as: readonly StampAssignment[]) => as.map(a => a.kind === 'extension' ? `ext ${a.level}` : a.kind);

describe('assignStamps', () => {
    test('a new base fills the slots in stamp order', () => {
        expect(describeAll(assignStamps(14).assignments)).toEqual([
            'ext 2', 'ext 3', 'ext 4', 'ext 4', 'tower', 'spawn', 'ext 5', 'ext 5', 'ext 6', 'ext 6', 'ext 7', 'ext 7', 'ext 8', 'ext 8',
        ]);
    });

    test('at RCL 4 (slots 1–4 built) the result is the same as for a new base', () => {
        const fixed = new Map([[0, ext(2)], [1, ext(3)], [2, ext(4)], [3, ext(4)]]);
        expect(assignStamps(14, fixed).assignments).toEqual(assignStamps(14).assignments);
    });

    test('at RCL 6 (slots 1–8 built) the tower stamp lands in slot 9 and the spawn stamp in slot 10', () => {
        const fixed = new Map([ext(2), ext(3), ext(4), ext(4), ext(5), ext(5), ext(6), ext(6)].map((a, i) => [i, a] as const));
        expect(describeAll(assignStamps(14, fixed).assignments)).toEqual([
            'ext 2', 'ext 3', 'ext 4', 'ext 4', 'ext 5', 'ext 5', 'ext 6', 'ext 6', 'tower', 'spawn', 'ext 7', 'ext 7', 'ext 8', 'ext 8',
        ]);
    });

    test('built slots keep their stamp even out of order (a v1 base that skipped a level)', () => {
        const fixed = new Map([[0, ext(2)], [1, ext(3)], [2, ext(4)], [3, ext(4)], [4, ext(5)], [5, ext(6)]]);
        const { assignments, dropped } = assignStamps(14, fixed);
        expect(describeAll(assignments).slice(0, 8)).toEqual(['ext 2', 'ext 3', 'ext 4', 'ext 4', 'ext 5', 'ext 6', 'tower', 'spawn']);
        expect(dropped).toEqual([]);
        expect(assignments.filter(a => a.kind === 'extension')).toHaveLength(12);
    });

    test('too few slots drop stamps from the end of the order', () => {
        const { assignments, dropped } = assignStamps(11);
        expect(assignments).toEqual(STAMP_ORDER.slice(0, 11));
        expect(describeAll(dropped)).toEqual(['ext 7', 'ext 8', 'ext 8']);
    });
});

describe('stampTiles', () => {
    const count = (a: StampAssignment, structure: StructureConstant, upTo: number, options = {}) =>
        stampTiles(a, options).filter(t => t.structure === structure && t.level <= upTo).length;

    test('the tower stamp adds tower 2 at RCL 5, tower 3 at RCL 7 and towers 4–6 at RCL 8', () => {
        expect([5, 6, 7, 8].map(rcl => count(TOWER_STAMP, STRUCTURE_TOWER, rcl))).toEqual([1, 1, 2, 5]);
    });

    test('the spawn stamp adds spawn 2 at RCL 7 and spawn 3, nuker and observer at RCL 8', () => {
        expect(count(SPAWN_STAMP, STRUCTURE_SPAWN, 7)).toBe(1);
        expect(count(SPAWN_STAMP, STRUCTURE_SPAWN, 8)).toBe(2);
        expect(count(SPAWN_STAMP, STRUCTURE_NUKER, 8)).toBe(1);
        expect(count(SPAWN_STAMP, STRUCTURE_OBSERVER, 8)).toBe(1);
        expect(count(SPAWN_STAMP, STRUCTURE_POWER_SPAWN, 8)).toBe(0);
    });

    test('with a nuker in the core ring, the spawn stamp holds the power spawn and no nuker', () => {
        const options = { powerSpawnInSpawnStamp: true };
        expect(count(SPAWN_STAMP, STRUCTURE_POWER_SPAWN, 8, options)).toBe(1);
        expect(count(SPAWN_STAMP, STRUCTURE_NUKER, 8, options)).toBe(0);
    });

    test('every spawn in the spawn stamp has a road next to it', () => {
        const tiles = stampTiles(SPAWN_STAMP);
        for (const spawn of tiles.filter(t => t.structure === STRUCTURE_SPAWN)) {
            expect(tiles.some(t => t.structure === STRUCTURE_ROAD && Math.max(Math.abs(t.dx - spawn.dx), Math.abs(t.dy - spawn.dy)) === 1)).toBe(true);
        }
    });

    test('all grid stamps share the same footprint', () => {
        const footprint = (a: StampAssignment) => stampTiles(a).map(t => `${t.dx}_${t.dy}`).sort();
        expect(footprint(TOWER_STAMP)).toEqual(footprint(ext(2)));
        expect(footprint(SPAWN_STAMP)).toEqual(footprint(ext(2)));
    });
});

describe('LAB_STAMP', () => {
    test.each([['as drawn', LAB_STAMP], ['mirrored', mirroredLabStamp()]])('%s: 10 labs (3, 6, 10 by RCL 6, 7, 8), all touching the road', (_, stamp) => {
        const labs = stamp.filter(t => t.structure === STRUCTURE_LAB);
        expect([6, 7, 8].map(rcl => labs.filter(l => l.level <= rcl).length)).toEqual([3, 6, 10]);
        const roads = stamp.filter(t => t.structure === STRUCTURE_ROAD);
        for (const lab of labs) {
            expect(roads.some(r => Math.max(Math.abs(r.dx - lab.dx), Math.abs(r.dy - lab.dy)) === 1)).toBe(true);
        }
    });

    test('both input labs are within range 2 of every other lab, and unlock first', () => {
        const labs = LAB_STAMP.filter(t => t.structure === STRUCTURE_LAB);
        for (const input of LAB_INPUTS) {
            expect(labs.find(l => l.dx === input.dx && l.dy === input.dy)?.level).toBe(6);
            for (const lab of labs) {
                expect(Math.max(Math.abs(lab.dx - input.dx), Math.abs(lab.dy - input.dy))).toBeLessThanOrEqual(2);
            }
        }
    });
});
