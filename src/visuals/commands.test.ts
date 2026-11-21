import { describe, expect, test } from '@jest/globals';
import { createVisualsCommand } from './commands';
import { activePanels, pruneVisuals, VISUALS_DURATION } from './settings';
import { createTestMemory } from 'testing/memory';
import { aBaseMemory } from 'testing/builders/context';

function setup() {
    const memory = createTestMemory();
    memory.bases_v3['W1N1'] = aBaseMemory();
    let tick = 100;
    return { memory, visuals: createVisualsCommand(() => memory, () => tick), setTick: (t: number) => { tick = t; } };
}

describe('cmd.visuals', () => {
    test('toggles the default panels for 200 ticks', () => {
        const { memory, visuals } = setup();
        expect(visuals('W1N1')).toBe(`Visuals on in W1N1 for ${VISUALS_DURATION} ticks: header, tasks, spawn, economy.`);
        expect(memory.visuals.W1N1).toEqual({ panels: ['header', 'tasks', 'spawn', 'economy'], until: 100 + VISUALS_DURATION });
        expect(visuals('W1N1')).toBe('Visuals off in W1N1.');
        expect(memory.visuals.W1N1).toBeUndefined();
    });

    test('chooses panels, turns off, lists and validates', () => {
        const { visuals } = setup();
        expect(visuals('W1N1', ['tasks'])).toContain(': tasks.');
        expect(visuals()).toBe(`W1N1: tasks (${VISUALS_DURATION} ticks left)`);
        expect(visuals('W1N1', 'off')).toBe('Visuals off in W1N1.');
        expect(visuals()).toBe('Visuals are off everywhere.');
        expect(visuals('W9N9')).toBe('Not a base: W9N9');
        expect(visuals('W1N1', ['nope' as 'tasks'])).toContain('Unknown panels: nope');
    });

    test('turning on again restarts the timer, including after it expired', () => {
        const { memory, visuals, setTick } = setup();
        visuals('W1N1');
        setTick(100 + VISUALS_DURATION);
        expect(visuals('W1N1')).toContain('Visuals on');
        expect(memory.visuals.W1N1.until).toBe(100 + 2 * VISUALS_DURATION);
    });
});

describe('visual settings', () => {
    test('activePanels until expiry, then pruned', () => {
        const memory = createTestMemory();
        memory.visuals.W1N1 = { panels: ['header'], until: 300 };
        expect(activePanels(memory, 'W1N1', 299)).toEqual(['header']);
        expect(activePanels(memory, 'W1N1', 300)).toBeNull();
        expect(activePanels(memory, 'W2N2', 1)).toBeNull();
        expect(pruneVisuals(memory, 299)).toEqual([]);
        expect(pruneVisuals(memory, 300)).toEqual(['W1N1']);
        expect(memory.visuals).toEqual({});
    });
});
