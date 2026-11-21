import { describe, expect, test } from '@jest/globals';
import { chooseSpawnPosition } from './spawn_position';

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
