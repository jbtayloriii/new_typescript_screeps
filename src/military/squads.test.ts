import { describe, expect, test } from '@jest/globals';
import { MAX_SQUAD_SIZE, squadComposition } from './squads';

describe('squadComposition', () => {
    test('attack: a healer per 3, the rest alternating melee and ranged', () => {
        expect(squadComposition('attack', 1)).toEqual(['melee']);
        expect(squadComposition('attack', 2)).toEqual(['melee', 'healer']);
        expect(squadComposition('attack', 4)).toEqual(['melee', 'ranged', 'melee', 'healer']);
        expect(squadComposition('attack', 6)).toEqual(['melee', 'ranged', 'melee', 'ranged', 'healer', 'healer']);
    });

    test('defend and escort: ranged with one healer from size 2', () => {
        expect(squadComposition('defend', 1)).toEqual(['ranged']);
        expect(squadComposition('defend', 3)).toEqual(['ranged', 'ranged', 'healer']);
        expect(squadComposition('escort', 2)).toEqual(['ranged', 'healer']);
    });

    test('clamps the size', () => {
        expect(squadComposition('attack', 100)).toHaveLength(MAX_SQUAD_SIZE);
        expect(squadComposition('defend', 0)).toHaveLength(1);
    });
});
