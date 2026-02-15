import { describe, expect, test } from '@jest/globals';
import { Coordinate } from 'global_types';
import { buildableStructureToChar } from '../utils/string_utils';

describe('buildableStructureToChar', () => {
    test('road returns r', () => {
        expect(buildableStructureToChar(STRUCTURE_ROAD)).toBe('r');
    });

    // TODO: Add more tests :^)
});
