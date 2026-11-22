import { describe, expect, test } from '@jest/globals';
import { BaseReport, TaskReport } from 'base/base_report';
import { buildPanels, economyPanel, formatBody, headerPanel, spawnQueuePanel, tasksPanel } from './panels';
import { COLORS } from './types';

function report(overrides: Partial<BaseReport> = {}): BaseReport {
    return {
        roomName: 'W1N1', tick: 1234, rcl: 3, rclProgress: 0.625, energyAvailable: 400, energyCapacity: 800,
        economy: { mode: 'static', incomePerTick: 20, upkeepPerTick: 3.25 }, upgradeBudget: 6,
        tasks: [], spawnQueue: [], spawns: { total: 1, busy: 1 },
        ...overrides,
    };
}

const task = (overrides: Partial<TaskReport>): TaskReport =>
    ({ name: 't', type: 'haul', creeps: [], wanted: 0, ...overrides });
const creep = (state?: number, extra = {}) => ({ name: 'c', state, spawning: false, miner: false, ...extra });

describe('formatBody', () => {
    test('counts parts in order of first appearance', () => {
        expect(formatBody([WORK, WORK, WORK, WORK, WORK, MOVE])).toBe('5W 1M');
        expect(formatBody([WORK, CARRY, MOVE, WORK, CARRY, MOVE])).toBe('2W 2C 2M');
        expect(formatBody([CLAIM, MOVE])).toBe('1K 1M');
    });
});

describe('headerPanel', () => {
    test('shows RCL, mode, energy bar and CPU', () => {
        const panel = headerPanel(report(), { used: 4.25, bucket: 9800 });
        expect(panel.title).toBe('W1N1');
        expect(panel.rows.map(r => r.text)).toEqual([
            'RCL 3 (62%) · static · tick 1234',
            'Energy 400/800 ',
            'Spawns 1/1 busy',
            'CPU 4.3 so far · bucket 9800',
        ]);
        expect(panel.rows[1].bar).toEqual({ fraction: 0.5, color: COLORS.warn });
    });

    test('omits progress at RCL 8, and CPU when not given', () => {
        const panel = headerPanel(report({ rcl: 8, rclProgress: null }));
        expect(panel.rows[0].text).toMatch(/^RCL 8 · /);
        expect(panel.rows).toHaveLength(3);
    });
});

describe('tasksPanel', () => {
    test('one row per task, in a fixed type order, with counts and creep states', () => {
        const panel = tasksPanel(report({
            tasks: [
                task({ type: 'upgrade', creeps: [creep(1, { ticksToLive: 900 }), creep(0)], wanted: 3, detail: 'WORK 2/6' }),
                task({ type: 'mine', creeps: [creep(undefined, { miner: true, ticksToLive: 50 })], wanted: 1 }),
                task({ type: 'remoteMine', label: 'W1N2 (d3)', creeps: [creep(undefined, { role: 'miner' }), creep(0, { role: 'hauler' })], wanted: 3 }),
            ],
        }));
        expect(panel.rows.map(r => r.text)).toEqual([
            'mine             1/1  miner 1 ttl 50',
            'upgrade          2/3  WG WORK 2/6 ttl 900',
            'remoteMine W1N2 (d3) 2/3  miner 1 hauler 1',
        ]);
        expect(panel.rows[0].color).toBe(COLORS.warn);   // low TTL
        expect(panel.rows[1].color).toBe(COLORS.text);   // short of creeps
    });

    test('says so when there are no tasks', () => {
        expect(tasksPanel(report()).rows).toEqual([{ text: 'no tasks', color: COLORS.dim }]);
    });
});

describe('spawnQueuePanel', () => {
    test('marks the spawning and waiting requests, and caps the list', () => {
        const entry = (status: 'spawning' | 'waiting' | 'queued' | 'unaffordable', priority: number) =>
            ({ taskName: 'x', taskType: 'haul' as const, priority, body: [CARRY, MOVE], cost: 100, status, urgent: false });
        const panel = spawnQueuePanel(report({
            spawnQueue: [entry('spawning', 100), entry('waiting', 90), ...Array.from({ length: 6 }, () => entry('queued', 10))],
        }));
        expect(panel.rows[0]).toEqual({ text: '+ haul       p100 1C 1M        100   spawning', color: COLORS.good });
        expect(panel.rows[1].text).toContain('> haul');
        expect(panel.rows[1].text).toContain('waiting 400/100');
        const waitingAfterSpawn = spawnQueuePanel(report({ spawnQueue: [{ ...entry('waiting', 90), cost: 550, energyLeft: 150 }] }));
        expect(waitingAfterSpawn.rows[0].text).toContain('waiting 150/550');
        expect(panel.rows[panel.rows.length - 1].text).toBe('  +2 more');
    });
});

describe('economyPanel', () => {
    test('shows the estimates', () => {
        expect(economyPanel(report()).rows.map(r => r.text)).toEqual([
            'income 20.0/t · upkeep 3.3/t',
            'spare 16.8/t · upgrade budget 6 WORK',
        ]);
    });
});

describe('buildPanels', () => {
    test('builds the chosen panels in HUD order', () => {
        expect(buildPanels(report(), ['economy', 'header']).map(p => p.title)).toEqual(['W1N1', 'Economy (estimated)']);
    });
});

describe('tasksPanel: squads', () => {
    test('shows role counts and the mission detail', () => {
        const panel = tasksPanel(report({
            tasks: [task({ type: 'squad', label: 'W3N3 (d5)', wanted: 3, detail: 'attack, rallying',
                creeps: [creep(0, { role: 'melee' }), creep(0, { role: 'healer' })] })],
        }));
        expect(panel.rows[0].text).toBe('squad W3N3 (d5)  2/3  melee 1 healer 1 attack, rallying');
    });
});

