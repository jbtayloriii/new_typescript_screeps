import { describe, expect, test } from '@jest/globals';
import { isRemoteThreatened, remoteMineTask, REMOTE_MINER_BODY, REMOTE_THREAT_COOLDOWN } from './remote_mine_task';
import { aRoom, energy } from 'testing/builders/room_snapshot_builder';
import { aTaskContext } from 'testing/builders/context';
import { worldOf } from 'testing/builders/world';
import { RoomIntel } from 'intel/types';
import { MyCreepSnapshot, RoomSnapshot } from 'snapshot/types';
import { RemoteMineTaskMemory } from './types';
import { WorkerState } from './behaviors';

const task: RemoteMineTaskMemory = { name: 'rm', roomName: 'W1N1', type: 'remoteMine', targetRoom: 'W1N2' };
const intel = (overrides: Partial<RoomIntel> = {}): RoomIntel => ({
    lastSeen: 1, sources: [{ id: 'rs1' as Id<Source>, x: 10, y: 10 }],
    controller: { x: 25, y: 25, level: 0 }, keeperLairs: 0, hostileCombatCreeps: 0, ...overrides,
});
const member = (extra: Partial<CreepMemory>) => ({ taskName: 'rm', baseRoomName: 'W1N1', ...extra });

function ctx(opts: { home?: RoomSnapshot, remote?: RoomSnapshot, creeps?: readonly MyCreepSnapshot[], intel?: RoomIntel, tick?: number } = {}) {
    const home = opts.home ?? aRoom('W1N1').withTick(opts.tick ?? 1000).withEnergy(800, 800).withSpawn(10, 10, { energy: 0 }).build();
    const rooms = opts.remote ? [home, opts.remote] : [home];
    return aTaskContext(home, { world: worldOf(rooms), creeps: opts.creeps ?? [], intel: { W1N2: opts.intel ?? intel() } });
}

describe('remoteMineTask.getSpawnRequests', () => {
    test('requests a miner per source (pre-assigned) and haulers, without vision', () => {
        const requests = remoteMineTask.getSpawnRequests(task, ctx());
        expect(requests[0]).toEqual({
            taskName: 'rm', priority: expect.any(Number), body: REMOTE_MINER_BODY,
            memory: { role: 'miner', targetId: 'rs1' },
        });
        // One source: 2×50×5/50 = 10 CARRY; 800 capacity → 8 CARRY per hauler → 2 haulers
        expect(requests.filter(r => r.memory?.role === 'hauler')).toHaveLength(2);
    });

    test('requests nothing while threatened', () => {
        expect(remoteMineTask.getSpawnRequests(task, ctx({ intel: intel({ hostilesLastSeen: 990 }) }))).toEqual([]);
    });
});

describe('isRemoteThreatened', () => {
    test('true with live combat hostiles or recent ones in intel', () => {
        const remote = aRoom('W1N2').withHostile(10, 10).build();
        expect(isRemoteThreatened(task, ctx({ remote }))).toBe(true);
        expect(isRemoteThreatened(task, ctx({ intel: intel({ hostilesLastSeen: 1000 - REMOTE_THREAT_COOLDOWN + 1 }) }))).toBe(true);
        expect(isRemoteThreatened(task, ctx({ intel: intel({ hostilesLastSeen: 1000 - REMOTE_THREAT_COOLDOWN }) }))).toBe(false);
    });
});

describe('remoteMineTask.decide', () => {
    test('miners travel to their source using intel, then harvest', () => {
        const away = aRoom('W1N1').withMyCreep('m', 10, 10, { memory: member({ role: 'miner', targetId: 'rs1' as Id<Source> }) }).build().creepsPresent;
        expect(remoteMineTask.decide(task, ctx({ creeps: away }))).toEqual([
            { kind: 'move', creepName: 'm', target: { x: 10, y: 10, roomName: 'W1N2' }, range: 1 },
        ]);

        const remote = aRoom('W1N2').withSource(10, 10).withMyCreep('m', 11, 11, { memory: member({ role: 'miner' }) }).build();
        expect(remoteMineTask.decide(task, ctx({ remote, creeps: [...remote.creepsPresent] }))).toEqual([
            { kind: 'harvest', creepName: 'm', targetId: remote.sources[0].id },
        ]);
    });

    test('haulers pick up drop-mined energy and bring it home', () => {
        const remote = aRoom('W1N2').withSource(10, 10).withDrop(11, 11, 400)
            .withMyCreep('h', 12, 12, { memory: member({ role: 'hauler', state: WorkerState.GATHERING }), store: energy(0, 400) }).build();
        expect(remoteMineTask.decide(task, ctx({ remote, creeps: [...remote.creepsPresent] }))).toContainEqual(
            { kind: 'pickup', creepName: 'h', targetId: remote.droppedResources[0].id });

        const loaded = aRoom('W1N2').withMyCreep('h', 12, 12, { memory: member({ role: 'hauler', state: WorkerState.WORKING }), store: energy(400, 400) }).build();
        const c = ctx({ remote: loaded, creeps: [...loaded.creepsPresent] });
        expect(remoteMineTask.decide(task, c)).toEqual([
            { kind: 'move', creepName: 'h', target: c.home.structures[0].pos, range: 1 },
        ]);
    });

    test('everyone retreats home while threatened', () => {
        const remote = aRoom('W1N2').withHostile(30, 30)
            .withMyCreep('m', 11, 11, { memory: member({ role: 'miner' }) }).build();
        expect(remoteMineTask.decide(task, ctx({ remote, creeps: [...remote.creepsPresent] }))).toEqual([
            { kind: 'move', creepName: 'm', target: { x: 25, y: 25, roomName: 'W1N1' }, range: 20 },
        ]);
    });
});

describe('remoteMineTask.isDone', () => {
    test('ends with its directive', () => {
        const active = { id: 'd1', type: 'remoteMine' as const, targetRoom: 'W1N2', source: 'auto' as const, status: 'active' as const, createdAt: 1 };
        const linked = { ...task, directiveId: 'd1' };
        expect(remoteMineTask.isDone(linked, aTaskContext(aRoom().build(), { directives: { d1: active } }))).toBe(false);
        expect(remoteMineTask.isDone(linked, aTaskContext(aRoom().build(), { directives: { d1: { ...active, status: 'done' } } }))).toBe(true);
        expect(remoteMineTask.isDone(linked, aTaskContext(aRoom().build()))).toBe(true);
    });
});
