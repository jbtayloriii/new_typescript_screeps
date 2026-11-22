import { describe, expect, test } from '@jest/globals';
import { createCommands } from './commands';
import { createTestMemory } from 'testing/memory';

function setup() {
    const memory = createTestMemory();
    memory.bases_v3['W1N1'] = { currentControllerLevelPlan: 0, lastBaseLayoutPlanTick: 0, initialSpawn: '10_10', baseLayout: {} };
    let tick = 100;
    return { memory, cmd: createCommands(() => memory, () => tick), setTick: (t: number) => { tick = t; } };
}

describe('console commands', () => {
    test('create manual directives, pending without a base', () => {
        const { memory, cmd } = setup();
        expect(cmd.remoteMine('W1N2')).toBe('Created d0 remoteMine W1N2 [pending] (manual)');
        expect(cmd.scout('W5N5', { base: 'W1N1' })).toBe('Created d1 scout W5N5 [active] from W1N1 (manual)');
        expect(cmd.claim('W2N3', { x: 20, y: 25 })).toContain('d2 claim W2N3');
        expect(memory.directives.d2.spawnPos).toEqual({ x: 20, y: 25 });
        expect(memory.directives.d0.createdAt).toBe(100);
    });

    test('rejects bad input and duplicates', () => {
        const { cmd } = setup();
        expect(cmd.remoteMine('nowhere')).toBe('Invalid room name: nowhere');
        expect(cmd.scout('W5N5', { base: 'W9N9' })).toBe('Not a base: W9N9');
        expect(cmd.claim('W2N3', { x: 0, y: 25 })).toContain('within 1-48');
        cmd.scout('W5N5');
        expect(cmd.scout('W5N5')).toContain('Already exists: d0');
    });

    test('list and cancel', () => {
        const { cmd, setTick } = setup();
        expect(cmd.list()).toBe('No directives.');
        cmd.remoteMine('W1N2');
        setTick(200);
        expect(cmd.cancel('d0')).toBe('Cancelled d0 remoteMine W1N2 [cancelled] (manual) - cancelled from the console');
        expect(cmd.cancel('d0')).toContain('Already cancelled');
        expect(cmd.cancel('d9')).toBe('No directive d9');
        expect(cmd.list()).toBe('No directives.');
        expect(cmd.list(true)).toContain('d0 remoteMine W1N2 [cancelled]');
        expect(cmd.help()).toContain('cmd.claim');
    });
});

describe('military commands', () => {
    test('attack and defend with a size', () => {
        const { memory, cmd } = setup();
        expect(cmd.attack('W3N3', { size: 6 })).toBe('Created d0 attack W3N3 [pending] (manual) size 6');
        expect(cmd.defend('W1N2', { base: 'W1N1' })).toBe('Created d1 defend W1N2 [active] from W1N1 (manual)');
        expect(cmd.attack('W3N3', { size: 0 })).toContain('Size must be');
        expect(memory.directives.d0.size).toBe(6);
    });

    test('escort guards another directive, in its room', () => {
        const { memory, cmd } = setup();
        cmd.claim('W2N3');
        expect(cmd.escort('d0')).toBe('Created d1 escort W2N3 [pending] (manual) escorting d0');
        expect(memory.directives.d1.escortedId).toBe('d0');
        expect(cmd.escort('d0')).toContain('Already exists');
        expect(cmd.escort('d9')).toBe('No directive d9');
        expect(cmd.escort('d1')).toContain("Can't escort");
    });
});

