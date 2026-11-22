import { describe, expect, test } from '@jest/globals';
import { claimTask, CLAIMER_BODY, isClaimed, PIONEERS } from './claim_task';
import { aRoom, energy } from 'testing/builders/room_snapshot_builder';
import { aTaskContext } from 'testing/builders/context';
import { worldOf } from 'testing/builders/world';
import { Directive } from 'directives/types';
import { MyCreepSnapshot, RoomSnapshot } from 'snapshot/types';
import { ClaimTaskMemory } from './types';
import { WorkerState } from './behaviors';
import { RoomIntel } from 'intel/types';

const task: ClaimTaskMemory = { name: 'c', roomName: 'W1N1', type: 'claim', targetRoom: 'W2N1', directiveId: 'd1' };
const directive: Directive = {
    id: 'd1', type: 'claim', targetRoom: 'W2N1', source: 'manual', status: 'active', createdAt: 1,
    baseRoomName: 'W1N1', spawnPos: { x: 20, y: 20 },
};
const member = (role: 'claimer' | 'pioneer', extra: Partial<CreepMemory> = {}) =>
    ({ memory: { taskName: 'c', baseRoomName: 'W1N1', role, ...extra } });
const intel: RoomIntel = { lastSeen: 1, sources: [], controller: { x: 25, y: 25, level: 0 }, keeperLairs: 0, hostileCombatCreeps: 0 };

function ctx(opts: { target?: RoomSnapshot, creeps?: readonly MyCreepSnapshot[], directive?: Directive } = {}) {
    const home = aRoom('W1N1').withEnergy(800, 800).build();
    const rooms = opts.target ? [home, opts.target] : [home];
    return aTaskContext(home, {
        world: worldOf(rooms), creeps: opts.creeps ?? [], intel: { W2N1: intel },
        directives: { d1: opts.directive ?? directive },
    });
}

describe('claimTask.getSpawnRequests', () => {
    test('one claimer until the controller is mine, then pioneers', () => {
        expect(claimTask.getSpawnRequests(task, ctx())).toEqual([
            { taskName: 'c', priority: expect.any(Number), body: CLAIMER_BODY, memory: { role: 'claimer' } },
        ]);
        const claimed = aRoom('W2N1').withRcl(1).build();
        const pioneers = claimTask.getSpawnRequests(task, ctx({ target: claimed }));
        expect(pioneers).toHaveLength(PIONEERS);
        expect(pioneers.every(r => r.memory?.role === 'pioneer')).toBe(true);
    });

    test('nothing once the room has a spawn', () => {
        const done = aRoom('W2N1').withRcl(1).withSpawn(20, 20).build();
        expect(claimTask.getSpawnRequests(task, ctx({ target: done }))).toEqual([]);
    });
});

describe('claimTask.decide', () => {
    test('the claimer walks to the controller (from intel without vision), then claims', () => {
        const away = aRoom('W1N1').withMyCreep('claimer', 10, 10, member('claimer')).build().creepsPresent;
        expect(claimTask.decide(task, ctx({ creeps: away }))).toEqual([
            { kind: 'move', creepName: 'claimer', target: { x: 25, y: 25, roomName: 'W2N1' }, range: 1 },
        ]);

        const target = aRoom('W2N1').withRcl(0, { my: false, owner: undefined }).withMyCreep('claimer', 24, 24, member('claimer')).build();
        expect(claimTask.decide(task, ctx({ target, creeps: target.creepsPresent }))).toEqual([
            { kind: 'claimController', creepName: 'claimer', targetId: target.controller!.id },
        ]);
    });

    test('once claimed, places the spawn site and pioneers build it', () => {
        const target = aRoom('W2N1').withRcl(1).withSource(10, 10)
            .withMyCreep('p1', 21, 21, { ...member('pioneer', { state: WorkerState.WORKING }), store: energy(50) }).build();
        const intents = claimTask.decide(task, ctx({ target, creeps: target.creepsPresent }));

        expect(intents).toContainEqual({ kind: 'createConstructionSite', pos: { x: 20, y: 20, roomName: 'W2N1' }, structureType: STRUCTURE_SPAWN });
        // No site yet this tick, so the pioneer heads to upgrade the new controller meanwhile
        expect(intents).toContainEqual({ kind: 'move', creepName: 'p1', target: target.controller!.pos, range: 3 });
    });

    test('pioneers travel to the target room first', () => {
        const away = aRoom('W1N1').withMyCreep('p1', 10, 10, member('pioneer')).build().creepsPresent;
        expect(claimTask.decide(task, ctx({ creeps: away }))).toEqual([
            { kind: 'move', creepName: 'p1', target: { x: 25, y: 25, roomName: 'W2N1' }, range: 20 },
        ]);
    });
});

describe('claimTask', () => {
    test('isClaimed uses live vision, else intel', () => {
        expect(isClaimed(task, ctx())).toBe(false);
        expect(isClaimed(task, ctx({ target: aRoom('W2N1').withRcl(1).build() }))).toBe(true);
    });

    test('is done when its directive is no longer active', () => {
        expect(claimTask.isDone(task, ctx())).toBe(false);
        expect(claimTask.isDone(task, ctx({ directive: { ...directive, status: 'done' } }))).toBe(true);
    });
});

describe('claiming a reserved room', () => {
    test("the claimer clears someone else's reservation first", () => {
        const target = aRoom('W2N1').withRcl(0, { my: false, owner: undefined, reservation: { username: 'them', ticksToEnd: 500 } })
            .withMyCreep('claimer', 24, 24, member('claimer')).build();
        expect(claimTask.decide(task, ctx({ target, creeps: target.creepsPresent }))).toEqual([
            { kind: 'attackController', creepName: 'claimer', targetId: target.controller!.id },
        ]);
    });
});

