import { describe, expect, test } from '@jest/globals';
import { isValidRoomName, roomCoords, roomLinearDistance } from './room_names';

describe('room names', () => {
    test('validates and converts to coordinates', () => {
        expect(isValidRoomName('W1N1')).toBe(true);
        expect(isValidRoomName('w1n1')).toBe(false);
        expect(roomCoords('E0S0')).toEqual({ x: 0, y: 0 });
        expect(roomCoords('W0N0')).toEqual({ x: -1, y: -1 });
        expect(roomCoords('nope')).toBeNull();
    });

    test('linear distance crosses the W/E and N/S lines', () => {
        expect(roomLinearDistance('W1N1', 'W1N1')).toBe(0);
        expect(roomLinearDistance('W1N1', 'W3N2')).toBe(2);
        expect(roomLinearDistance('W0N0', 'E0S0')).toBe(1);
        expect(roomLinearDistance('W1N1', 'bad')).toBe(Infinity);
    });
});
