import { describe, expect, test } from '@jest/globals';
import { chooseControllerContainerTile } from './survey';

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
