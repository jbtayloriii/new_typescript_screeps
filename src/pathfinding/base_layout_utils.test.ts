import { describe, expect, test } from '@jest/globals';
import { BaseLayoutMap, Coordinate } from 'global_types';
import {
    BuiltStructure, chooseControllerContainerTile, findStampSlots, getInitialBaseCenter, GRID_SLOTS, planBaseLayout, planCore,
    PROTECTED_STRUCTURES, PROTECTIVE_RAMPART_RCL,
} from './base_layout_utils';
import { BaseLayoutMapObj } from './base_layout_map_obj';
import { checkLayout } from './layout_checks';
import { layoutInputFor, loadTestRoom, TEST_ROOM_SPAWNS } from './testdata/test_rooms';
import { basePlanCoordToBuildingObj } from '../utils/string_utils';
import { readFile } from '../testing/file_utils';

/** The layouts the v1 planner produced in the game for two real bases. */
const V1_LAYOUTS: { [room: string]: { initialSpawn: string, controllerContainer: Coordinate, baseLayout: BaseLayoutMap } } =
    JSON.parse(readFile(__dirname, 'testdata/output/v1_layouts.json'));

const ROOMS = Object.keys(TEST_ROOM_SPAWNS);

type Planned = { level: number, x: number, y: number, structure: BuildableStructureConstant };

function plannedList(layout: BaseLayoutMap): Planned[] {
    return Object.entries(layout).flatMap(([level, coords]) => coords.map(c => {
        const { coord, structure } = basePlanCoordToBuildingObj(c);
        return { level: Number(level), x: coord.x, y: coord.y, structure };
    }));
}

function countUpTo(layout: BaseLayoutMap, structure: BuildableStructureConstant, rcl: number): number {
    return plannedList(layout).filter(p => p.structure === structure && p.level <= rcl).length;
}

/** The v1 extension search, kept as a reference: stamp centers and levels, including the slots it found twice. */
function legacyExtensionStamps(room: RoomName): { center: Coordinate, level: number }[] {
    const { map, center, diamondDistances } = planCore(layoutInputFor(room));
    const offsets = [{ x: 3, y: 2 }, { x: 2, y: 3 }, { x: -3, y: 2 }, { x: -2, y: 3 }, { x: 3, y: -2 }, { x: 2, y: -3 }, { x: -3, y: -2 }, { x: -2, y: -3 }];
    const body = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
    const roads = [[-2, 0], [-1, -1], [0, -2], [1, -1], [2, 0], [1, 1], [0, 2], [-1, 1]];
    const levels = [2, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8];
    const queue = offsets.map(o => ({ x: center.x + o.x, y: center.y + o.y }));
    const stamps: { center: Coordinate, level: number }[] = [];
    let iterations = 50;
    while (queue.length > 0 && iterations > 0 && stamps.length < levels.length) {
        const c = queue.shift()!;
        const fits = diamondDistances[c.y][c.x] >= 3
            && body.every(([dx, dy]) => map.isOpenOrType({ x: c.x + dx, y: c.y + dy }, STRUCTURE_EXTENSION))
            && roads.every(([dx, dy]) => map.isOpenOrType({ x: c.x + dx, y: c.y + dy }, STRUCTURE_ROAD));
        if (fits) {
            const level = levels[stamps.length];
            stamps.push({ center: c, level });
            body.forEach(([dx, dy]) => map.addBuilding(level, { x: c.x + dx, y: c.y + dy }, STRUCTURE_EXTENSION));
            roads.forEach(([dx, dy]) => map.addBuilding(level, { x: c.x + dx, y: c.y + dy }, STRUCTURE_ROAD));
            queue.push({ x: c.x + 2, y: c.y + 2 }, { x: c.x - 2, y: c.y + 2 }, { x: c.x + 2, y: c.y - 2 }, { x: c.x - 2, y: c.y - 2 });
        }
        iterations--;
    }
    return stamps;
}

/** Extension stamp centers in a layout: extensions whose 4 neighbors are extensions too. */
function extensionStampCenters(layout: BaseLayoutMap): { center: Coordinate, level: number }[] {
    const ext = new Map(plannedList(layout).filter(p => p.structure === STRUCTURE_EXTENSION).map(p => [`${p.x}_${p.y}`, p.level]));
    return [...ext].flatMap(([k, level]) => {
        const [x, y] = k.split('_').map(Number);
        const isCenter = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => ext.has(`${x + dx}_${y + dy}`));
        return isCenter ? [{ center: { x, y }, level }] : [];
    });
}

describe('stamp grid', () => {
    test.each(['W23S31', 'W11S14'])('the v1 reference search reproduces the layout the game saved for %s', room => {
        const fromGame = extensionStampCenters(V1_LAYOUTS[room].baseLayout);
        const legacy = legacyExtensionStamps(room);
        // v1 counted a slot found twice as a new stamp, so keep the first level of each center.
        const distinct = legacy.filter((s, i) => legacy.findIndex(o => o.center.x === s.center.x && o.center.y === s.center.y) === i);
        expect(sortCenters(distinct)).toEqual(sortCenters(fromGame));
    });

    test('v1 lost extension stamps by counting a slot twice (W23S31 had 45 of 60 extensions)', () => {
        expect(countUpTo(V1_LAYOUTS.W23S31.baseLayout, STRUCTURE_EXTENSION, 8)).toBe(45);
    });

    test.each(ROOMS)('finds the same slots, in the same order, as the v1 search in %s', room => {
        const { map, center, diamondDistances } = planCore(layoutInputFor(room));
        const slots = findStampSlots(center, diamondDistances, map, GRID_SLOTS);
        const legacy = legacyExtensionStamps(room).map(s => s.center);
        const distinct = legacy.filter((c, i) => legacy.findIndex(o => o.x === c.x && o.y === c.y) === i);
        expect(slots.slice(0, distinct.length)).toEqual(distinct);
        expect(slots.length).toBeGreaterThanOrEqual(distinct.length);
    });
});

describe('planBaseLayout', () => {
    test.each(ROOMS)('%s passes every layout check', room => {
        const input = layoutInputFor(room);
        const plan = planBaseLayout(input);
        const problems = plan.warnings.filter(w => !w.startsWith('only '));
        expect(problems).toEqual([]);
    });

    test('a room with too few grid slots drops stamps from the end of the order', () => {
        const plan = planBaseLayout(layoutInputFor('E23S15'));
        expect(plan.warnings).toEqual(['only 10 grid slots fit; dropped extensions (RCL 7), extensions (RCL 7), extensions (RCL 8), extensions (RCL 8)']);
        // The tower and spawn stamps still fit, ahead of the RCL 5+ extensions.
        expect(countUpTo(plan.layout, STRUCTURE_TOWER, 8)).toBe(6);
        expect(countUpTo(plan.layout, STRUCTURE_SPAWN, 8)).toBe(3);
    });

    // Rooms with 2 sources and a mineral (E22S15 has 1 source and no mineral; E23S15 too few slots).
    test.each(['W23S31', 'W11S14'])('%s plans every structure each RCL allows', room => {
        const { layout } = planBaseLayout(layoutInputFor(room));
        const expected: [BuildableStructureConstant, number[]][] = [
            [STRUCTURE_SPAWN, [1, 1, 1, 1, 1, 1, 2, 3]],
            [STRUCTURE_EXTENSION, [0, 5, 10, 20, 30, 40, 50, 60]],
            [STRUCTURE_TOWER, [0, 0, 1, 1, 2, 2, 3, 6]],
            [STRUCTURE_LINK, [0, 0, 0, 0, 2, 3, 4, 4]],
            [STRUCTURE_LAB, [0, 0, 0, 0, 0, 3, 6, 10]],
            [STRUCTURE_STORAGE, [0, 0, 0, 1, 1, 1, 1, 1]],
            [STRUCTURE_TERMINAL, [0, 0, 0, 0, 0, 1, 1, 1]],
            [STRUCTURE_EXTRACTOR, [0, 0, 0, 0, 0, 1, 1, 1]],
            [STRUCTURE_FACTORY, [0, 0, 0, 0, 0, 0, 1, 1]],
            [STRUCTURE_NUKER, [0, 0, 0, 0, 0, 0, 0, 1]],
            [STRUCTURE_OBSERVER, [0, 0, 0, 0, 0, 0, 0, 1]],
            [STRUCTURE_POWER_SPAWN, [0, 0, 0, 0, 0, 0, 0, 1]],
        ];
        for (const [structure, counts] of expected) {
            expect([1, 2, 3, 4, 5, 6, 7, 8].map(rcl => countUpTo(layout, structure, rcl))).toEqual(counts);
        }
        // 2 sources + controller from RCL 2, mineral from RCL 6.
        expect(countUpTo(layout, STRUCTURE_CONTAINER, 2)).toBe(3);
        expect(countUpTo(layout, STRUCTURE_CONTAINER, 6)).toBe(4);
    });

    test.each(ROOMS)('%s puts a rampart over every spawn, tower and storage from RCL 3', room => {
        const { layout } = planBaseLayout(layoutInputFor(room));
        const planned = plannedList(layout);
        const ramparts = new Map(planned.filter(p => p.structure === STRUCTURE_RAMPART).map(p => [`${p.x}_${p.y}`, p.level]));
        const protectedOnes = planned.filter(p => PROTECTED_STRUCTURES.has(p.structure));
        expect(protectedOnes.length).toBeGreaterThan(0);
        for (const p of protectedOnes) {
            expect(ramparts.get(`${p.x}_${p.y}`)).toBe(Math.max(p.level, PROTECTIVE_RAMPART_RCL));
        }
    });

    test('W23S31 gets ramparts as its spawns, towers and storage unlock (plus the core center at RCL 5)', () => {
        const { layout } = planBaseLayout(layoutInputFor('W23S31'));
        expect([1, 2, 3, 4, 5, 6, 7, 8].map(rcl => countUpTo(layout, STRUCTURE_RAMPART, rcl))).toEqual([0, 0, 2, 3, 5, 5, 7, 11]);
    });

    test('puts the power spawn in the core ring and the nuker in the spawn stamp', () => {
        const input = layoutInputFor('W11S14');
        const { layout } = planBaseLayout(input);
        const room = plannedList(layout);
        const center = planCore(input).center;
        const powerSpawn = room.find(p => p.structure === STRUCTURE_POWER_SPAWN)!;
        expect(Math.max(Math.abs(powerSpawn.x - center.x), Math.abs(powerSpawn.y - center.y))).toBe(1);
        const nuker = room.find(p => p.structure === STRUCTURE_NUKER)!;
        expect(Math.max(Math.abs(nuker.x - center.x), Math.abs(nuker.y - center.y))).toBeGreaterThan(1);
    });

    test('keeps a saved controller container tile', () => {
        const plan = planBaseLayout(layoutInputFor('W23S31', {
            existing: { layout: {}, built: [], controllerContainer: { x: 27, y: 6 } },
        }));
        expect(plan.controllerContainer).toEqual({ x: 27, y: 6 });
        expect(plan.layout[2]).toContain('27_6_c');
    });

    test('places links next to the source and controller containers, longest haul first', () => {
        const { layout, controllerContainer } = planBaseLayout(layoutInputFor('W23S31'));
        const links = plannedList(layout).filter(p => p.structure === STRUCTURE_LINK).sort((a, b) => a.level - b.level);
        expect(links.map(l => l.level)).toEqual([5, 5, 6, 7]);
        const containers = plannedList(layout).filter(p => p.structure === STRUCTURE_CONTAINER && p.level === 2);
        for (const link of links.slice(1)) {
            expect(containers.some(c => Math.max(Math.abs(c.x - link.x), Math.abs(c.y - link.y)) === 1)).toBe(true);
        }
        const room = loadTestRoom('W23S31');
        const controllerLink = links.slice(1).find(l => Math.max(Math.abs(l.x - controllerContainer!.x), Math.abs(l.y - controllerContainer!.y)) === 1)!;
        expect(Math.max(Math.abs(controllerLink.x - room.controller!.x), Math.abs(controllerLink.y - room.controller!.y))).toBeLessThanOrEqual(3);
    });
});

describe('replanning an existing base', () => {
    /** What a base built from a layout up to an RCL would have in the room. */
    function builtUpTo(layout: BaseLayoutMap, rcl: number, controllerContainer?: Coordinate): BuiltStructure[] {
        const built: BuiltStructure[] = plannedList(layout).filter(p => p.level <= rcl).map(p => ({ x: p.x, y: p.y, structure: p.structure }));
        if (controllerContainer) built.push({ ...controllerContainer, structure: STRUCTURE_CONTAINER });
        return built;
    }

    function nonRoad(built: readonly BuiltStructure[]): string[] {
        return built.filter(b => b.structure !== STRUCTURE_ROAD).map(b => `${b.x}_${b.y}_${b.structure}`).sort();
    }

    function plannedKeys(layout: BaseLayoutMap): Set<string> {
        return new Set(plannedList(layout).map(p => `${p.x}_${p.y}_${p.structure}`));
    }

    test('W23S31 at RCL 5 (built from its v1 layout) keeps everything built; the tower stamp takes the next free slot', () => {
        const v1 = V1_LAYOUTS.W23S31;
        const built = builtUpTo(v1.baseLayout, 5, v1.controllerContainer);
        const plan = planBaseLayout(layoutInputFor('W23S31', {
            existing: { layout: v1.baseLayout, built, controllerContainer: v1.controllerContainer },
        }));

        expect(plan.warnings).toEqual([]);
        const planned = plannedKeys(plan.layout);
        expect(nonRoad(built).filter(k => !planned.has(k))).toEqual([]);
        expect(plan.controllerContainer).toEqual(v1.controllerContainer);

        // Slots 1–6 hold the v1 extension stamps for RCL 2–5, so the tower stamp is slot 7.
        const input = layoutInputFor('W23S31');
        const { map, center, diamondDistances } = planCore(input);
        const slots = findStampSlots(center, diamondDistances, map, GRID_SLOTS);
        expect(plan.layout[5]).toContain(`${slots[6].x}_${slots[6].y}_t`);
        expect(countUpTo(plan.layout, STRUCTURE_TOWER, 5)).toBe(2);
        // The lost v1 extensions come back: 60 in all.
        expect(countUpTo(plan.layout, STRUCTURE_EXTENSION, 8)).toBe(60);
    });

    test.each(ROOMS)('replanning a fully built v2 base of %s changes nothing but roads', room => {
        const first = planBaseLayout(layoutInputFor(room));
        const built = builtUpTo(first.layout, 8);
        const second = planBaseLayout(layoutInputFor(room, {
            existing: { layout: first.layout, built, controllerContainer: first.controllerContainer },
        }));
        expect(second.warnings).toEqual(first.warnings);
        const nonRoads = (layout: BaseLayoutMap) => plannedList(layout).filter(p => p.structure !== STRUCTURE_ROAD)
            .map(p => `${p.level}_${p.x}_${p.y}_${p.structure}`).sort();
        expect(nonRoads(second.layout)).toEqual(nonRoads(first.layout));
    });

    test('a nuker built in the core ring stays; the power spawn moves to the spawn stamp', () => {
        const input = layoutInputFor('W11S14');
        const first = planBaseLayout(input);
        const powerSpawn = plannedList(first.layout).find(p => p.structure === STRUCTURE_POWER_SPAWN)!;
        const built: BuiltStructure[] = [...builtUpTo(first.layout, 6), { x: powerSpawn.x, y: powerSpawn.y, structure: STRUCTURE_NUKER }];
        const plan = planBaseLayout(layoutInputFor('W11S14', {
            existing: { layout: first.layout, built, controllerContainer: first.controllerContainer },
        }));
        expect(plan.warnings).toEqual([]);
        expect(plan.layout[8]).toContain(`${powerSpawn.x}_${powerSpawn.y}_N`);
        expect(countUpTo(plan.layout, STRUCTURE_NUKER, 8)).toBe(1);
        expect(countUpTo(plan.layout, STRUCTURE_POWER_SPAWN, 8)).toBe(1);
    });

    test('roads avoid a built link the layout did not plan', () => {
        const first = planBaseLayout(layoutInputFor('W23S31'));
        // A tile on a source road, far from the core.
        const road = plannedList(first.layout).filter(p => p.structure === STRUCTURE_ROAD && p.level === 2)
            .sort((a, b) => b.x - a.x)[0];
        const built: BuiltStructure[] = [{ x: road.x, y: road.y, structure: STRUCTURE_LINK }];
        const plan = planBaseLayout(layoutInputFor('W23S31', { existing: { layout: first.layout, built } }));
        expect(plannedList(plan.layout).filter(p => p.x === road.x && p.y === road.y && p.structure === STRUCTURE_ROAD)).toEqual([]);
    });

    test('structures the layout does not plan block their tiles', () => {
        const first = planBaseLayout(layoutInputFor('W23S31'));
        const lab = plannedList(first.layout).find(p => p.structure === STRUCTURE_LAB)!;
        const plan = planBaseLayout(layoutInputFor('W23S31', {
            existing: { layout: {}, built: [{ x: lab.x, y: lab.y, structure: STRUCTURE_WALL }] },
        }));
        expect(plannedList(plan.layout).some(p => p.x === lab.x && p.y === lab.y)).toBe(false);
    });
});

describe('checkLayout', () => {
    const open = () => false;
    const core = { x: 10, y: 10 };

    test('reports more of a structure than an RCL allows', () => {
        const layout: BaseLayoutMap = { 1: [], 2: [], 3: ['5_5_t', '7_7_t'], 4: [], 5: [], 6: [], 7: [], 8: [] };
        expect(checkLayout({ layout, isWall: open, obstacles: [], core })).toEqual([
            'RCL 3: 2 tower planned, 1 allowed',
            'RCL 4: 2 tower planned, 1 allowed',
        ]);
    });

    test('allows a rampart over a road or a structure, but not two structures on a tile', () => {
        const ok: BaseLayoutMap = { 1: ['5_5_r'], 3: ['7_7_t', '7_7_R'], 5: ['5_5_R'] };
        expect(checkLayout({ layout: ok, isWall: open, obstacles: [], core })).toEqual([]);
        const bad: BaseLayoutMap = { 2: ['5_5_x'], 3: ['5_5_t'] };
        expect(checkLayout({ layout: bad, isWall: open, obstacles: [], core })).toContain('tile 5_5 has extension + tower');
        const twoRamparts: BaseLayoutMap = { 3: ['5_5_t', '5_5_R'], 4: ['5_5_R'] };
        expect(checkLayout({ layout: twoRamparts, isWall: open, obstacles: [], core })).toContain('tile 5_5 has tower + rampart + rampart');
    });

    test('reports structures with no reachable neighbor', () => {
        // An extension walled in by other extensions.
        const ring = [[4, 4], [5, 4], [6, 4], [4, 5], [6, 5], [4, 6], [5, 6], [6, 6]].map(([x, y]) => `${x}_${y}_x`);
        const layout: BaseLayoutMap = { 8: [...ring.slice(0, 8), '5_5_x'] };
        expect(checkLayout({ layout, isWall: open, obstacles: [], core })).toEqual(['extension at 5,5 can\'t be reached from the core']);
    });

    test('reports labs whose inputs are out of range', () => {
        const layout: BaseLayoutMap = { 6: ['1_1_L', '5_1_L', '9_1_L'] };
        expect(checkLayout({ layout, isWall: open, obstacles: [], core: { x: 1, y: 2 } }))
            .toContain('no two labs are within range 2 of all the others');
    });
});

describe('BaseLayoutMapObj', () => {
    test('blocked tiles take nothing and are never serialized', () => {
        const map = new BaseLayoutMapObj(5);
        map.block({ x: 1, y: 1 });
        expect(map.isOpen({ x: 1, y: 1 })).toBe(false);
        expect(() => map.addBuilding(2, { x: 1, y: 1 }, STRUCTURE_EXTENSION)).toThrow();
        expect(Object.values(map.toSerializedMap()).flat()).toEqual([]);
    });

    test('the cost matrix makes roads cheap and other structures impassable', () => {
        const map = new BaseLayoutMapObj(5);
        map.addBuilding(1, { x: 1, y: 1 }, STRUCTURE_ROAD);
        map.addBuilding(2, { x: 2, y: 1 }, STRUCTURE_EXTENSION);
        const matrix = map.toCostMatrix(1);
        expect(matrix.get(1, 1)).toBe(1);
        expect(matrix.get(2, 1)).toBe(0xff);
        expect(matrix.get(3, 1)).toBe(0);
    });
});

describe('getBaseCenter', () => {
    test('usableLocation_picksLowestYPosition', () => {
        const squareDistances = [
            [1, 2, 3, 4, 5],
            [1, 2, 3, 2, 1],
            [1, 3, 4, 3, 1],
            [1, 2, 3, 1, 2],
            [1, 2, 1, 1, 2],
        ];

        expect(getInitialBaseCenter({ x: 2, y: 2 }, squareDistances)).toStrictEqual({ x: 2, y: 1 });
    });

    test('onlyInitialCoordinate_cannotFindCenter', () => {
        // [2, 2] is distance 4 (which is OK), but we can't use that.
        const squareDistances = [
            [1, 2, 3, 4, 5],
            [1, 2, 2, 2, 1],
            [1, 2, 4, 2, 1],
            [1, 2, 1, 1, 2],
            [1, 2, 1, 1, 2],
        ];

        expect(getInitialBaseCenter({ x: 2, y: 2 }, squareDistances)).toBeNull();
    });

    test('noUsableLocationsOfThreeOrMore_cannotFindCenter', () => {
        const squareDistances = [
            [1, 2, 3, 4, 5],
            [1, 2, 2, 2, 1],
            [1, 2, 1, 2, 1],
            [1, 2, 1, 1, 2],
            [1, 2, 1, 1, 2],
        ];

        expect(getInitialBaseCenter({ x: 3, y: 3 }, squareDistances)).toBeNull();
    });
});

describe('chooseControllerContainerTile', () => {
    const noWalls = () => false;

    test('picks the tile 2 from the controller that is closest to the spawn', () => {
        expect(chooseControllerContainerTile({ x: 25, y: 25 }, { x: 10, y: 25 }, noWalls, new Set())).toEqual({ x: 23, y: 25 });
    });

    test('skips walls, planned tiles and room edges', () => {
        const walls = (x: number, y: number) => x === 23 && y === 24;
        expect(chooseControllerContainerTile({ x: 25, y: 25 }, { x: 10, y: 25 }, walls, new Set(['23_25'])))
            .toEqual({ x: 23, y: 26 });
        expect(chooseControllerContainerTile({ x: 1, y: 1 }, { x: 1, y: 10 }, noWalls, new Set())).toEqual({ x: 1, y: 3 });
    });

    test('returns undefined when nothing fits', () => {
        expect(chooseControllerContainerTile({ x: 25, y: 25 }, { x: 10, y: 10 }, () => true, new Set())).toBeUndefined();
    });
});

function sortCenters(stamps: { center: Coordinate, level: number }[]) {
    return [...stamps].sort((a, b) => a.center.y - b.center.y || a.center.x - b.center.x);
}
