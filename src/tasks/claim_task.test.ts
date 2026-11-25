import { describe, expect, test } from '@jest/globals';
import { claimTask, CLAIMER_BODY, DOWNGRADE_UPGRADE_TICKS, INCUBATION_HELPERS, isClaimed, MIN_PIONEERS, pioneersWanted, pioneerTravelTicks } from './claim_task';
import { SCOUT_BODY } from './scout_task';
import { aRoom, energy } from 'testing/builders/room_snapshot_builder';
import { aTaskContext } from 'testing/builders/context';
import { worldOf, WorldOptions } from 'testing/builders/world';
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
const member = (role: 'claimer' | 'pioneer' | 'scout', extra: Partial<CreepMemory> = {}) =>
    ({ memory: { taskName: 'c', baseRoomName: 'W1N1', role, ...extra } });
const intel: RoomIntel = { lastSeen: 1, sources: [], controller: { x: 25, y: 25, level: 0 }, keeperLairs: 0, hostileCombatCreeps: 0 };

function ctx(opts: { target?: RoomSnapshot, creeps?: readonly MyCreepSnapshot[], directive?: Directive, worldOpts?: WorldOptions, intel?: RoomIntel } = {}) {
    const home = aRoom('W1N1').withEnergy(800, 800).build();
    const rooms = opts.target ? [home, opts.target] : [home];
    return aTaskContext(home, {
        world: worldOf(rooms, opts.worldOpts), creeps: opts.creeps ?? [], intel: { W2N1: opts.intel ?? intel },
        directives: { d1: opts.directive ?? directive },
    });
}

describe('claimTask.getSpawnRequests', () => {
    test('one claimer until the controller is mine, then pioneers', () => {
        expect(claimTask.getSpawnRequests(task, ctx())).toEqual([
            { taskName: 'c', priority: expect.any(Number), body: CLAIMER_BODY, memory: { role: 'claimer', targetRoom: 'W2N1' } },
        ]);
        const claimed = aRoom('W2N1').withRcl(1).build();
        const pioneers = claimTask.getSpawnRequests(task, ctx({ target: claimed }));
        expect(pioneers).toHaveLength(MIN_PIONEERS);
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

    test('follows the directive\'s phase: a scout first, nothing while evaluating, then the claimer', () => {
        const at = (phase: Directive['phase']) => claimTask.getSpawnRequests(task, ctx({ directive: { ...directive, phase } }));
        expect(at('scouting')).toEqual([
            { taskName: 'c', priority: expect.any(Number), body: SCOUT_BODY, memory: { role: 'scout', targetRoom: 'W2N1' } },
        ]);
        expect(at('evaluating')).toEqual([]);
        expect(at('claiming').map(r => r.memory?.role)).toEqual(['claimer']);
        const scouting = ctx({ directive: { ...directive, phase: 'scouting' }, creeps: aRoom('W1N1').withMyCreep('s', 1, 1, member('scout')).build().creepsPresent });
        expect(claimTask.getSpawnRequests(task, scouting)).toEqual([]);
    });

    test('creeps follow the planned route', () => {
        const routed = { ...directive, phase: 'claiming' as const, route: ['W1N2', 'W2N2', 'W2N1'] };
        const creeps = aRoom('W1N1').withMyCreep('cl', 10, 10, member('claimer')).build().creepsPresent;
        expect(claimTask.decide(task, ctx({ directive: routed, creeps }))).toContainEqual(
            { kind: 'move', creepName: 'cl', target: { x: 25, y: 25, roomName: 'W2N1' }, range: 1, route: ['W1N2', 'W2N2', 'W2N1'] });
    });

    test('the claimer scales its MOVE parts to the base (full size: CLAIM + 5 MOVE)', () => {
        expect(CLAIMER_BODY.base).toEqual([CLAIM, MOVE]);
        expect(CLAIMER_BODY.pattern).toEqual([MOVE]);
        expect(CLAIMER_BODY.maxRepeats).toBe(4);
    });
});


describe('claimTask: building', () => {
    const building = { ...directive, phase: 'building' as const, route: ['W2N1'] };
    const twoSources: RoomIntel = { ...intel, sources: [{ id: 'a' as Id<Source>, x: 10, y: 10 }, { id: 'b' as Id<Source>, x: 40, y: 40 }] };

    test('one pioneer per open tile at each source, at most 2 per source', () => {
        // Source a has a single open tile (11,10); source b is in the open.
        const walls = new Set<string>();
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!(dx === 1 && dy === 0)) walls.add(`${10 + dx}_${10 + dy}`);
        const c = ctx({ directive: building, intel: twoSources, worldOpts: { walls: { W2N1: walls } } });
        expect(pioneersWanted(task, c)).toBe(3);
        expect(claimTask.getSpawnRequests(task, c).map(r => r.memory)).toEqual(Array(3).fill({ role: 'pioneer', targetRoom: 'W2N1', helperFor: 'd1' }));
        // At least 2, even without intel on the sources.
        expect(pioneersWanted(task, ctx({ directive: building }))).toBe(MIN_PIONEERS);
    });

    test('replaces a pioneer early: when it has less life left than spawning and travel take', () => {
        expect(pioneerTravelTicks(task, ctx({ directive: building }))).toBe(50);
        expect(pioneerTravelTicks(task, ctx({ directive: { ...building, pioneerTravelTicks: 120 } }))).toBe(120);
        const pioneers = (ttl: number) => aRoom('W1N1')
            .withMyCreep('p1', 1, 1, { ...member('pioneer'), ticksToLive: 1000, activeParts: { [WORK]: 5, [CARRY]: 5, [MOVE]: 5 } })
            .withMyCreep('p2', 1, 2, { ...member('pioneer'), ticksToLive: ttl, activeParts: { [WORK]: 5, [CARRY]: 5, [MOVE]: 5 } })
            .build().creepsPresent;
        // 15 parts spawn in 45 ticks, plus 120 ticks of travel.
        const c = (ttl: number) => ctx({ directive: { ...building, pioneerTravelTicks: 120 }, creeps: pioneers(ttl) });
        expect(claimTask.getSpawnRequests(task, c(165))).toEqual([]);
        expect(claimTask.getSpawnRequests(task, c(164))).toHaveLength(1);
    });

    test('a threatened room gets nothing new, and the creeps wait at home', () => {
        const target = aRoom('W2N1').withRcl(1).withHostile(30, 30, { owner: 'someone' })
            .withMyCreep('p1', 21, 21, member('pioneer')).build();
        const c = ctx({ directive: building, target, creeps: target.creepsPresent });
        expect(claimTask.getSpawnRequests(task, c)).toEqual([]);
        expect(claimTask.decide(task, c)).toContainEqual({ kind: 'move', creepName: 'p1', target: { x: 25, y: 25, roomName: 'W1N1' }, range: 20 });
    });

    test('pioneers upgrade first when the controller is close to downgrading', () => {
        const target = (ticksToDowngrade: number) => aRoom('W2N1').withRcl(1, { ticksToDowngrade }).withSource(10, 10)
            .withConstructionSite(STRUCTURE_SPAWN, 20, 20)
            .withMyCreep('p1', 21, 21, { ...member('pioneer', { state: WorkerState.WORKING }), store: energy(50) }).build();
        const decide = (t: RoomSnapshot) => claimTask.decide(task, ctx({ directive: building, target: t, creeps: t.creepsPresent }));
        expect(decide(target(DOWNGRADE_UPGRADE_TICKS - 1)).find(i => 'creepName' in i && i.creepName === 'p1'))
            .toEqual({ kind: 'move', creepName: 'p1', target: { x: 25, y: 25, roomName: 'W2N1' }, range: 3 });
        expect(decide(target(10000)).find(i => 'creepName' in i && i.creepName === 'p1')).toMatchObject({ kind: 'build' });
    });
});

describe('claimTask: incubating', () => {
    const incubating = { ...directive, phase: 'incubating' as const, route: ['W2N1'], pioneerTravelTicks: 100 };
    const newBase = (build: (b: ReturnType<typeof aRoom>) => ReturnType<typeof aRoom> = b => b) =>
        build(aRoom('W2N1').withRcl(2).withSpawn(20, 20)).build();
    const helper = (name: string, ticksToLive: number) => ({
        memory: { taskName: 'x', baseRoomName: 'W2N1', helperFor: 'd1' }, ticksToLive,
        activeParts: { [WORK]: 5, [CARRY]: 5, [MOVE]: 5 },
    });

    test('keeps INCUBATION_HELPERS helpers going, counting the ones already handed over', () => {
        const none = newBase();
        expect(claimTask.getSpawnRequests(task, ctx({ directive: incubating, target: none })))
            .toEqual(Array(INCUBATION_HELPERS).fill(expect.objectContaining({ memory: { role: 'pioneer', targetRoom: 'W2N1', helperFor: 'd1' } })));
        const oneLeft = newBase(b => b.withMyCreep('h1', 5, 5, helper('h1', 1000)));
        expect(claimTask.getSpawnRequests(task, ctx({ directive: incubating, target: oneLeft }))).toHaveLength(1);
        // One handed over and lasting, one about to die (145 = 45 to spawn + 100 travel): replace it.
        const aging = newBase(b => b.withMyCreep('h1', 5, 5, helper('h1', 1000)).withMyCreep('h2', 6, 6, helper('h2', 144)));
        expect(claimTask.getSpawnRequests(task, ctx({ directive: incubating, target: aging }))).toHaveLength(1);
    });

    test('helpers travel to the new base; nothing else is placed there', () => {
        const away = aRoom('W1N1').withMyCreep('p1', 10, 10, member('pioneer')).build().creepsPresent;
        expect(claimTask.decide(task, ctx({ directive: incubating, target: newBase(), creeps: away }))).toEqual([
            { kind: 'move', creepName: 'p1', target: { x: 25, y: 25, roomName: 'W2N1' }, range: 20, route: ['W2N1'] },
        ]);
    });
});
