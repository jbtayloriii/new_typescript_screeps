import { describe, expect, test } from '@jest/globals';
import { chooseSpawnPosition, evaluateSpawnPosition, exitDistances, exitPenalty, FULL_EXTENSION_STAMPS, walkingDistances } from './spawn_position';
import { loadTestRoom } from 'pathfinding/testdata/test_rooms';

const terrain = (isWall: (x: number, y: number) => boolean) => ({ isWall, isSwamp: () => false });

describe('chooseSpawnPosition', () => {
    test('picks an open tile close to the sources and controller', () => {
        const pos = chooseSpawnPosition(terrain(() => false), [{ x: 20, y: 20 }, { x: 30, y: 20 }], { x: 25, y: 30 });
        expect(pos).not.toBeNull();
        // Total range to the three targets is minimal around the middle of them
        expect(Math.abs(pos!.x - 25)).toBeLessThanOrEqual(1);
        expect(pos!.y).toBeGreaterThanOrEqual(20);
        expect(pos!.y).toBeLessThanOrEqual(25);
    });

    test('needs room for the 3x3 core next to the spawn', () => {
        // Only a 3-wide corridor at x 24-26 is open: too narrow for the core plus its road ring.
        const corridor = terrain(x => x < 24 || x > 26);
        expect(chooseSpawnPosition(corridor, [{ x: 25, y: 10 }], undefined)).toBeNull();
    });
});

describe('evaluateSpawnPosition', () => {
    const fromTestRoom = (name: string) => {
        const room = loadTestRoom(name);
        return {
            roomName: name,
            terrain: { isWall: (x: number, y: number) => room.terrainGrid[y][x] === 1, isSwamp: (x: number, y: number) => room.terrainGrid[y][x] === 2 },
            sources: room.sources,
            controller: room.controller,
            mineral: room.mineral,
        };
    };

    test('W23S31: next to where Cyborger put its spawn (22,9), with the whole layout', () => {
        const result = evaluateSpawnPosition(fromTestRoom('W23S31'));
        expect(result).toEqual({ evaluation: { spawnPos: { x: 24, y: 9 }, sourceDistances: [10, 19], controllerDistance: 4, extensionStamps: FULL_EXTENSION_STAMPS, warnings: [] } });
    });

    test.each(['W11S14', 'E23S15', 'E22S15'])('%s fits the whole layout', name => {
        const result = evaluateSpawnPosition(fromTestRoom(name));
        expect('evaluation' in result && result.evaluation.extensionStamps).toBe(FULL_EXTENSION_STAMPS);
    });

    test('warns about one-source rooms and layouts that fall short', () => {
        const result = evaluateSpawnPosition(fromTestRoom('E22S15'));
        expect('evaluation' in result && result.evaluation.warnings).toEqual(['only 1 source']);
        // E23S15 with the test spawn at 40,40 only fits 10 grid slots.
        const given = evaluateSpawnPosition({ ...fromTestRoom('E23S15'), spawnPos: { x: 40, y: 40 } });
        expect('evaluation' in given && given.evaluation.warnings).toEqual(['layout short: 8/12 extension stamps']);
    });

    test('a given spawn tile that can\'t fit the core is a blocker', () => {
        expect(evaluateSpawnPosition({ ...fromTestRoom('W23S31'), spawnPos: { x: 1, y: 1 } }))
            .toEqual({ blocker: 'the base core doesn\'t fit next to the given spawn tile 1,1' });
    });
});

describe('distance fills', () => {
    test('swamps cost 2, walls block, diagonals cost 1', () => {
        const terrain = { isWall: (x: number, y: number) => x === 2 && y < 3, isSwamp: (x: number) => x === 1 };
        const d = walkingDistances(terrain, [{ x: 0, y: 0 }]);
        expect(d[0][1]).toBe(2);
        expect(d[1][1]).toBe(2);
        expect(d[0][2]).toBe(Infinity);
        // Around the wall: (0,1) 1, (1,2) swamp 3, (2,3) 4, (3,3) 5.
        expect(d[3][3]).toBe(5);
    });

    test('exits: tiles near the edge are penalised, up to 6 tiles in', () => {
        const d = exitDistances({ isWall: () => false, isSwamp: () => false });
        expect(d[25][3]).toBe(3);
        expect([1, 6, 7].map(exitPenalty)).toEqual([30, 5, 0]);
    });
});
