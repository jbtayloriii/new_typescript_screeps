import { describe, expect, test } from '@jest/globals';
import { createCommands } from './commands';
import { createTestMemory } from 'testing/memory';
import { worldOf } from 'testing/builders/world';
import { aRoom } from 'testing/builders/room_snapshot_builder';

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


describe('cmd.layout', () => {
    test('prints the layout by RCL with warnings, and turns the overlay on', () => {
        const { memory, cmd } = setup();
        memory.bases_v3['W1N1'] = {
            ...memory.bases_v3['W1N1'],
            layoutVersion: 2,
            layoutWarnings: ['only 13 grid slots fit; dropped extensions (RCL 8)'],
            baseLayout: { 1: ['10_10_s'], 2: ['12_12_x', '13_12_x'], 3: ['14_14_t'] },
        };
        const out = cmd.layout('W1N1');
        expect(out).toContain('W1N1 layout v2:');
        expect(out).toContain('RCL 2: extension 2');
        expect(out).toContain('RCL 4: -');
        expect(out).toContain('only 13 grid slots fit');
        expect(memory.visuals['W1N1']).toEqual({ panels: ['layout'], until: 300 });
    });

    test('shows built/planned counts when the room is visible', () => {
        const memory = createTestMemory();
        memory.bases_v3['W1N1'] = { currentControllerLevelPlan: 0, lastBaseLayoutPlanTick: 0, initialSpawn: '10_10', baseLayout: { 2: ['12_12_x', '13_12_x'] } };
        const cmd = createCommands(() => memory, () => 100, () => new Set(['12_12_extension']));
        expect(cmd.layout('W1N1')).toContain('RCL 2: extension 1/2');
    });

    test('keeps HUD panels that are on, and turns only the overlay off', () => {
        const { memory, cmd } = setup();
        memory.visuals = { W1N1: { panels: ['tasks'], until: 150 } };
        cmd.layout('W1N1');
        expect(memory.visuals['W1N1'].panels).toEqual(['tasks', 'layout']);
        expect(cmd.layout('W1N1', 'off')).toBe('Layout overlay off in W1N1.');
        expect(memory.visuals['W1N1']).toEqual({ panels: ['tasks'], until: 300 });
        memory.visuals = { W1N1: { panels: ['layout'], until: 150 } };
        cmd.layout('W1N1', 'off');
        expect(memory.visuals['W1N1']).toBeUndefined();
    });

    test('rejects rooms that are not bases', () => {
        const { cmd } = setup();
        expect(cmd.layout('W9N9')).toBe('Not a base: W9N9');
    });
});

describe('cmd.claim and cmd.evaluate', () => {
    test('force is saved on the claim', () => {
        const { memory, cmd } = setup();
        cmd.claim('W2N3', { force: true });
        expect(memory.directives.d0.force).toBe(true);
    });

    test('evaluate needs intel, then prints the spawn tile, checks and readiness', () => {
        const memory = createTestMemory();
        memory.bases_v3['W1N1'] = { currentControllerLevelPlan: 0, lastBaseLayoutPlanTick: 0, initialSpawn: '10_10', baseLayout: {} };
        const bases = [{ roomName: 'W1N1', energyCapacity: 550, staticMining: true, rcl: 2, storageEnergy: 0, underAttack: false }];
        const planInput = () => ({ world: worldOf([aRoom('W1N1').withTick(100).build()]), directives: [], bases, intel: memory.intel });
        const cmd = createCommands(() => memory, () => 100, undefined, planInput);
        expect(cmd.evaluate('W2N3')).toBe("No intel for W2N3: run cmd.scout('W2N3') first (or cmd.claim, which scouts it).");

        memory.intel['W2N3'] = {
            lastSeen: 90, sources: [{ id: 's' as Id<Source>, x: 10, y: 10 }, { id: 't' as Id<Source>, x: 40, y: 40 }],
            controller: { x: 25, y: 25, level: 0 }, keeperLairs: 0, hostileCombatCreeps: 0,
        };
        const out = cmd.evaluate('W2N3');
        expect(out).toMatch(/^W2N3 from W1N1:\n  spawn \d+,\d+ · sources \d+, \d+ · controller \d+ \(walking\)/);
        expect(out).toContain('extension stamps 12/12 · route 1 room: W2N3');
        expect(out).toContain('room: ok · base: not ready (base RCL 2 < 4)');
    });
});
