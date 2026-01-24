import { describe, expect, test } from '@jest/globals';
import { OpenClosedSet } from './open_closed_set';

describe('Basic checks', () => {
    test('open() and close() return correct values', () => {
        const set = new OpenClosedSet();
        set.open(3);
        set.close(5);
        set.open(7);

        expect(set.isOpen(3)).toBe(true);
        expect(set.isClosed(3)).toBe(false);

        expect(set.isOpen(5)).toBe(false);
        expect(set.isClosed(5)).toBe(true);

        expect(set.isOpen(7)).toBe(true);
        expect(set.isClosed(7)).toBe(false);
    });

    test('clear() removes entries', () => {
        const set = new OpenClosedSet();
        set.open(3);
        set.close(5);
        set.open(7);

        set.clear();

        expect(set.isOpen(3)).toBe(false);
        expect(set.isClosed(3)).toBe(false);
        expect(set.isOpen(5)).toBe(false);
        expect(set.isClosed(5)).toBe(false);
        expect(set.isOpen(7)).toBe(false);
        expect(set.isClosed(7)).toBe(false);
    });

    test('Closing opened value marks it as closed', () => {
        const set = new OpenClosedSet();
        set.open(3);

        expect(set.isOpen(3)).toBe(true);
        expect(set.isClosed(3)).toBe(false);

        set.close(3);

        expect(set.isOpen(3)).toBe(false);
        expect(set.isClosed(3)).toBe(true);
    });

    test('Opening closed value marks it as open', () => {
        const set = new OpenClosedSet();
        set.close(90);

        expect(set.isOpen(90)).toBe(false);
        expect(set.isClosed(90)).toBe(true);

        set.open(90);

        expect(set.isOpen(90)).toBe(true);
        expect(set.isClosed(90)).toBe(false);
    });

    test('Values not opened or closed return false for isOpen() and isClosed()', () => {
        const set = new OpenClosedSet();
        set.open(30);
        set.close(-1);

        expect(set.isOpen(55)).toBe(false);
        expect(set.isClosed(55)).toBe(false);

        expect(set.isOpen(-100)).toBe(false);
        expect(set.isClosed(-100)).toBe(false);
    });
});
