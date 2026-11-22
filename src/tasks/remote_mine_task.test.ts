import { describe, expect, test } from '@jest/globals';
import {
    chooseRemoteContainerTile, isRemoteThreatened, remoteMineTask, REMOTE_MINER_BODY, REMOTE_THREAT_COOLDOWN, remoteReservation,
    RESERVATION_TOP_UP, RESERVED_REMOTE_MINER_BODY, RESERVER_BODY, RESERVER_MIN_CAPACITY, RESERVER_PRIORITY, ROAD_HAULER_BODY,
    roadStage, roadWork,
} from './remote_mine_task';
import { aRoom, energy } from 'testing/builders/room_snapshot_builder';
import { aBaseMemory, aTaskContext } from 'testing/builders/context';
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

describe('reservation', () => {
    const reservedLive = (username: string, ticksToEnd: number) =>
        aRoom('W1N2').withRcl(0, { my: false, owner: undefined, reservation: { username, ticksToEnd } }).withSource(10, 10).build();

    test('reads the reservation live, else from intel', () => {
        expect(remoteReservation(task, ctx({ remote: reservedLive('me', 4000) }))).toEqual({ username: 'me', ticksLeft: 4000 });
        const fromIntel = ctx({ intel: intel({ controller: { x: 25, y: 25, level: 0, reservedBy: 'me', reservationEnd: 3000 } }) });
        expect(remoteReservation(task, fromIntel)).toEqual({ username: 'me', ticksLeft: 2000 });
        expect(remoteReservation(task, ctx())).toBeNull();
    });

    test('requests a reserver when the base can afford one and the reservation is low', () => {
        const rich = aRoom('W1N1').withTick(1000).withEnergy(RESERVER_MIN_CAPACITY, RESERVER_MIN_CAPACITY).withSpawn(10, 10).build();
        const reserverRequests = (remote?: RoomSnapshot, creeps: readonly MyCreepSnapshot[] = []) =>
            remoteMineTask.getSpawnRequests(task, aTaskContext(rich, {
                world: worldOf(remote ? [rich, remote] : [rich]), creeps, intel: { W1N2: intel() },
            })).filter(r => r.memory?.role === 'reserver');

        expect(reserverRequests()).toEqual([{ taskName: 'rm', priority: RESERVER_PRIORITY, body: RESERVER_BODY, memory: { role: 'reserver' } }]);
        expect(reserverRequests(reservedLive('me', RESERVATION_TOP_UP + 1))).toEqual([]);
        expect(reserverRequests(reservedLive('me', RESERVATION_TOP_UP - 1))).toHaveLength(1);
        const reserver = aRoom('W1N1').withMyCreep('r', 1, 1, { memory: member({ role: 'reserver' }) }).build().creepsPresent;
        expect(reserverRequests(undefined, reserver)).toEqual([]);
        // Not before the base can afford 2 CLAIM parts
        expect(remoteMineTask.getSpawnRequests(task, ctx()).some(r => r.memory?.role === 'reserver')).toBe(false);
    });

    test('while reserved: bigger miners and haulers sized for 10 energy/tick', () => {
        const remote = reservedLive('me', 4000);
        const requests = remoteMineTask.getSpawnRequests(task, ctx({ remote }));
        expect(requests.find(r => r.memory?.role === 'miner')?.body).toBe(RESERVED_REMOTE_MINER_BODY);
        // One source: 2×50×10/50 = 20 CARRY; 800 capacity → 8 CARRY per hauler → 3 haulers
        expect(requests.filter(r => r.memory?.role === 'hauler')).toHaveLength(3);
    });

    test('haulers are sized from the measured distance when known', () => {
        const home = aRoom('W1N1').withTick(1000).withEnergy(800, 800).withSpawn(10, 10).build();
        const c = aTaskContext(home, { intel: { W1N2: intel() }, baseMemory: aBaseMemory({ remoteDistances: { rs1: 20 } }) });
        // 2×20×5/50 = 4 CARRY → 1 hauler
        expect(remoteMineTask.getSpawnRequests(task, c).filter(r => r.memory?.role === 'hauler')).toHaveLength(1);
    });

    test('reservers walk to the controller and reserve it', () => {
        const remote = aRoom('W1N2').withRcl(0, { my: false, owner: undefined }).withMyCreep('r', 24, 24, { memory: member({ role: 'reserver' }) }).build();
        expect(remoteMineTask.decide(task, ctx({ remote, creeps: remote.creepsPresent }))).toEqual([
            { kind: 'reserveController', creepName: 'r', targetId: remote.controller!.id },
        ]);
    });

    test('an Invader core pauses the remote; its leftover reservation alone does not', () => {
        expect(isRemoteThreatened(task, ctx({ remote: reservedLive('Invader', 3000) }))).toBe(false);
        const withCore = aRoom('W1N2').withStructure(STRUCTURE_INVADER_CORE, 20, 20, { owner: 'other' }).build();
        expect(isRemoteThreatened(task, ctx({ remote: withCore }))).toBe(true);
        expect(isRemoteThreatened(task, ctx({ intel: intel({ invaderCores: 1 }) }))).toBe(true);
    });

    test("reservers clear someone else's reservation before reserving", () => {
        const remote = aRoom('W1N2').withRcl(0, { my: false, owner: undefined, reservation: { username: 'Invader', ticksToEnd: 2000 } })
            .withMyCreep('r', 24, 24, { memory: member({ role: 'reserver' }) }).build();
        expect(remoteMineTask.decide(task, ctx({ remote, creeps: remote.creepsPresent }))).toEqual([
            { kind: 'attackController', creepName: 'r', targetId: remote.controller!.id },
        ]);
    });
});

describe('remote containers', () => {
    test('the container tile is the walkable tile next to the source closest to the room center', () => {
        const terrain = { isWall: (x: number, y: number) => x === 11 && y === 11, isSwamp: () => false };
        expect(chooseRemoteContainerTile({ x: 10, y: 10, roomName: 'W1N2' }, terrain)).toEqual({ x: 11, y: 10, roomName: 'W1N2' });
    });

    test('placed while reserved; the miner builds it when full, and repairs it when worn', () => {
        const reserved = { my: false, owner: undefined, reservation: { username: 'me', ticksToEnd: 4000 } };
        const minerMem = member({ role: 'miner' });
        const minerParts = { [WORK]: 5, [CARRY]: 1, [MOVE]: 3 };

        const empty = aRoom('W1N2').withRcl(0, reserved).withSource(10, 10).withMyCreep('m', 11, 11, { memory: minerMem, activeParts: minerParts }).build();
        expect(remoteMineTask.decide(task, ctx({ remote: empty, creeps: empty.creepsPresent }))).toContainEqual(
            { kind: 'createConstructionSite', pos: { x: 11, y: 11, roomName: 'W1N2' }, structureType: STRUCTURE_CONTAINER });

        const withSite = aRoom('W1N2').withRcl(0, reserved).withSource(10, 10).withConstructionSite(STRUCTURE_CONTAINER, 11, 11)
            .withMyCreep('m', 11, 11, { memory: minerMem, activeParts: minerParts, store: energy(50, 50) }).build();
        expect(remoteMineTask.decide(task, ctx({ remote: withSite, creeps: withSite.creepsPresent }))).toContainEqual(
            { kind: 'build', creepName: 'm', targetId: withSite.constructionSites[0].id });

        const worn = aRoom('W1N2').withRcl(0, reserved).withSource(10, 10)
            .withStructure(STRUCTURE_CONTAINER, 11, 11, { owner: 'none', hits: 1000, hitsMax: 250000 })
            .withMyCreep('m', 11, 11, { memory: minerMem, activeParts: minerParts, store: energy(50, 50) }).build();
        expect(remoteMineTask.decide(task, ctx({ remote: worn, creeps: worn.creepsPresent }))).toContainEqual(
            { kind: 'repair', creepName: 'm', targetId: worn.structures[0].id });
    });
});

describe('remote roads', () => {
    test('haulers carry a WORK part once roads are being built', () => {
        const home = aRoom('W1N1').withTick(10000).withEnergy(800, 800).withSpawn(10, 10).build();
        const directive = { id: 'd1', type: 'remoteMine' as const, targetRoom: 'W1N2', source: 'auto' as const, status: 'active' as const, createdAt: 1 };
        const c = aTaskContext(home, {
            intel: { W1N2: intel() }, directives: { d1: directive }, economy: { incomePerTick: 20, upkeepPerTick: 2 },
        });
        const linked = { ...task, directiveId: 'd1' };
        expect(roadStage(linked, c)).toBe('swamp');
        expect(remoteMineTask.getSpawnRequests(linked, c).find(r => r.memory?.role === 'hauler')?.body).toBe(ROAD_HAULER_BODY);
    });

    test('roadWork: build a nearby road site, else repair a worn road, outside the home room only', () => {
        const hauler = { memory: member({ role: 'hauler' }), activeParts: { [WORK]: 1, [CARRY]: 4, [MOVE]: 5 }, store: energy(100, 200) };
        const withSite = aRoom('W1N2').withConstructionSite(STRUCTURE_ROAD, 12, 10).withMyCreep('h', 10, 10, hauler).build();
        expect(roadWork(withSite.creepsPresent[0], withSite, 'W1N1')).toEqual({ kind: 'build', creepName: 'h', targetId: withSite.constructionSites[0].id });

        const worn = aRoom('W1N2').withStructure(STRUCTURE_ROAD, 11, 10, { owner: 'none', hits: 1000, hitsMax: 5000 }).withMyCreep('h', 10, 10, hauler).build();
        expect(roadWork(worn.creepsPresent[0], worn, 'W1N1')).toEqual({ kind: 'repair', creepName: 'h', targetId: worn.structures[0].id });

        const home = aRoom('W1N1').withConstructionSite(STRUCTURE_ROAD, 12, 10).withMyCreep('h', 10, 10, hauler).build();
        expect(roadWork(home.creepsPresent[0], home, 'W1N1')).toBeNull();
    });

    test('decide places road sites along the planned route at the current stage', () => {
        const remote = aRoom('W1N2').withSource(10, 10).build();
        const home = aRoom('W1N1').withTick(10000).withEnergy(800, 800).withSpawn(10, 10).build();
        const directive = { id: 'd1', type: 'remoteMine' as const, targetRoom: 'W1N2', source: 'auto' as const, status: 'active' as const, createdAt: 1 };
        const c = aTaskContext(home, {
            world: worldOf([home, remote], { swamps: { W1N2: new Set(['20_20']) } }),
            intel: { W1N2: intel() }, directives: { d1: directive }, economy: { incomePerTick: 20, upkeepPerTick: 2 },
            baseMemory: aBaseMemory({ remoteRoutes: { W1N2: [{ room: 'W1N2', tiles: [20 * 50 + 20, 20 * 50 + 21] }] } }),
        });
        expect(remoteMineTask.decide({ ...task, directiveId: 'd1' }, c)).toContainEqual(
            { kind: 'createConstructionSite', pos: { x: 20, y: 20, roomName: 'W1N2' }, structureType: STRUCTURE_ROAD });
    });
});

