import { describe, expect, test } from '@jest/globals';
import { chooseLeader, currentSquadState, nextSquadState, RALLY_TIMEOUT, rallyPoint, squadHealth, squadTask } from './squad_task';
import { FORMING_SQUAD_PRIORITY, SquadState, SQUAD_BODIES, MISSION_PRIORITY } from './squads';
import { HOME_DEFENSE_PRIORITY } from './home_defense';
import { aRoom, RoomSnapshotBuilder } from 'testing/builders/room_snapshot_builder';
import { aTaskContext } from 'testing/builders/context';
import { worldOf } from 'testing/builders/world';
import { Directive } from 'directives/types';
import { MyCreepSnapshot, RoomSnapshot } from 'snapshot/types';
import { SquadTaskMemory, TaskMemory } from 'tasks/types';

const task: SquadTaskMemory = { name: 'sq', roomName: 'W1N1', type: 'squad', mission: 'attack', targetRoom: 'W2N1', directiveId: 'd1' };
const directive = (overrides: Partial<Directive> = {}): Directive => ({
    id: 'd1', type: 'attack', targetRoom: 'W2N1', source: 'manual', status: 'active', createdAt: 1, baseRoomName: 'W1N1', size: 2,
    ...overrides,
});
const member = (role: 'melee' | 'ranged' | 'healer', state?: SquadState) =>
    ({ memory: { taskName: 'sq', baseRoomName: 'W1N1', role, state } });

function homeWith(build: (b: RoomSnapshotBuilder) => RoomSnapshotBuilder = b => b): RoomSnapshot {
    return build(aRoom('W1N1').withEnergy(800, 800).withSpawn(10, 10)).build();
}

function ctx(home: RoomSnapshot, opts: { rooms?: RoomSnapshot[], creeps?: readonly MyCreepSnapshot[], d?: Directive, baseTasks?: TaskMemory[] } = {}) {
    return aTaskContext(home, {
        world: worldOf([home, ...(opts.rooms ?? [])]),
        creeps: opts.creeps ?? home.creepsPresent,
        directives: { d1: opts.d ?? directive() },
        baseTasks: opts.baseTasks,
    });
}

describe('squad helpers', () => {
    test('leader: fighters before healers, then by name', () => {
        const room = homeWith(b => b.withMyCreep('b-heal', 1, 1, member('healer')).withMyCreep('z-ranged', 1, 2, member('ranged'))
            .withMyCreep('a-ranged', 1, 3, member('ranged')));
        expect(chooseLeader(room.creepsPresent)?.name).toBe('a-ranged');
    });

    test('state is the most common one among members, defaulting to rally', () => {
        const room = homeWith(b => b.withMyCreep('a', 1, 1, member('melee', SquadState.ENGAGE))
            .withMyCreep('b', 1, 2, member('melee', SquadState.ENGAGE)).withMyCreep('c', 1, 3, member('melee')));
        expect(currentSquadState(room.creepsPresent)).toBe(SquadState.ENGAGE);
        expect(currentSquadState([])).toBe(SquadState.RALLY);
    });

    test('state transitions: rally until complete and gathered; retreat below 40%, back above 90%', () => {
        const home = homeWith(b => b.withMyCreep('a', 11, 11, member('melee')).withMyCreep('b', 12, 12, member('healer')));
        const rally = rallyPoint(home);
        expect(nextSquadState(SquadState.RALLY, home.creepsPresent, 2, rally)).toBe(SquadState.ENGAGE);
        expect(nextSquadState(SquadState.RALLY, home.creepsPresent, 3, rally)).toBe(SquadState.RALLY);
        const hurt = home.creepsPresent.map(c => ({ ...c, hits: 100, hitsMax: 300 }));
        expect(squadHealth(hurt)).toBeCloseTo(1 / 3);
        expect(nextSquadState(SquadState.ENGAGE, hurt, 2, rally)).toBe(SquadState.RETREAT);
        expect(nextSquadState(SquadState.RETREAT, hurt, 2, rally)).toBe(SquadState.RETREAT);
        expect(nextSquadState(SquadState.RETREAT, home.creepsPresent, 2, rally)).toBe(SquadState.ENGAGE);
    });
});

describe('rally timeout', () => {
    const waited = (ticks: number) => ({ ticksToLive: CREEP_LIFE_TIME - ticks });
    const gathered = (...ticks: number[]) =>
        homeWith(b => ticks.reduce((r, t, i) => r.withMyCreep(`m${i}`, 11, 11 + i, { ...member('melee'), ...waited(t) }), b));

    test('an incomplete squad moves out after RALLY_TIMEOUT with at least half its members', () => {
        const two = gathered(RALLY_TIMEOUT + 1, 10);
        expect(nextSquadState(SquadState.RALLY, two.creepsPresent, 4, rallyPoint(two))).toBe(SquadState.ENGAGE);
        expect(nextSquadState(SquadState.RALLY, gathered(RALLY_TIMEOUT - 1, 10).creepsPresent, 4, rallyPoint(two))).toBe(SquadState.RALLY);
    });

    test('keeps waiting with fewer than half, or while members are still walking to the rally point', () => {
        const one = gathered(RALLY_TIMEOUT + 1);
        expect(nextSquadState(SquadState.RALLY, one.creepsPresent, 4, rallyPoint(one))).toBe(SquadState.RALLY);
        const straggling = homeWith(b => b.withMyCreep('a', 11, 11, { ...member('melee'), ...waited(RALLY_TIMEOUT + 1) })
            .withMyCreep('b', 40, 40, { ...member('melee'), ...waited(10) }));
        expect(nextSquadState(SquadState.RALLY, straggling.creepsPresent, 4, rallyPoint(straggling))).toBe(SquadState.RALLY);
    });
});

describe('squadTask.getSpawnRequests', () => {
    test('once the first member exists, the rest of a forming squad spawns at FORMING_SQUAD_PRIORITY', () => {
        const spawningMelee = homeWith(b => b.withMyCreep('a', 10, 10, { ...member('melee'), spawning: true }));
        expect(squadTask.getSpawnRequests(task, ctx(spawningMelee))).toEqual([
            { taskName: 'sq', priority: FORMING_SQUAD_PRIORITY, body: SQUAD_BODIES.healer, memory: { role: 'healer' } },
        ]);
        // Replacements for a squad that already moved out stay at the mission priority.
        const engaged = homeWith(b => b.withMyCreep('a', 1, 1, member('melee', SquadState.ENGAGE)));
        expect(squadTask.getSpawnRequests(task, ctx(engaged))[0].priority).toBe(MISSION_PRIORITY.attack);
    });


    test('requests the missing roles at the mission priority', () => {
        expect(squadTask.getSpawnRequests(task, ctx(homeWith()))).toEqual([
            { taskName: 'sq', priority: MISSION_PRIORITY.attack, body: SQUAD_BODIES.melee, memory: { role: 'melee' } },
            { taskName: 'sq', priority: MISSION_PRIORITY.attack - 1, body: SQUAD_BODIES.healer, memory: { role: 'healer' } },
        ]);
        const withMelee = homeWith(b => b.withMyCreep('a', 1, 1, member('melee')));
        expect(squadTask.getSpawnRequests(task, ctx(withMelee)).map(r => r.memory?.role)).toEqual(['healer']);
    });

    test('nothing once the directive has ended', () => {
        expect(squadTask.getSpawnRequests(task, ctx(homeWith(), { d: directive({ status: 'done' }) }))).toEqual([]);
        expect(squadTask.isDone(task, ctx(homeWith(), { d: directive({ status: 'done' }) }))).toBe(true);
    });
});

describe('squadTask.decide', () => {
    test('rallies at the spawn until complete, then moves out together', () => {
        const waiting = homeWith(b => b.withMyCreep('a', 30, 30, member('melee')));
        const intents = squadTask.decide(task, ctx(waiting));
        expect(intents).toContainEqual({ kind: 'setCreepMemory', creepName: 'a', patch: { state: SquadState.RALLY } });
        expect(intents).toContainEqual({ kind: 'move', creepName: 'a', target: { x: 10, y: 10, roomName: 'W1N1' }, range: 3 });

        const ready = homeWith(b => b.withMyCreep('a', 11, 11, member('melee', SquadState.RALLY)).withMyCreep('b', 13, 13, member('healer', SquadState.RALLY)));
        const moving = squadTask.decide(task, ctx(ready));
        expect(moving).toContainEqual({ kind: 'setCreepMemory', creepName: 'a', patch: { state: SquadState.ENGAGE } });
        expect(moving).toContainEqual({ kind: 'move', creepName: 'a', target: { x: 25, y: 25, roomName: 'W2N1' }, range: 20 });
        expect(moving).toContainEqual({ kind: 'move', creepName: 'b', target: { x: 11, y: 11, roomName: 'W1N1' }, range: 1 });
    });

    test('the leader waits for stragglers (but not on a room edge)', () => {
        const spread = homeWith(b => b.withMyCreep('a', 20, 20, member('melee', SquadState.ENGAGE)).withMyCreep('b', 30, 30, member('ranged', SquadState.ENGAGE)));
        const intents = squadTask.decide(task, ctx(spread));
        expect(intents.some(i => i.kind === 'move' && i.creepName === 'a')).toBe(false);
        expect(intents).toContainEqual({ kind: 'move', creepName: 'b', target: { x: 20, y: 20, roomName: 'W1N1' }, range: 1 });

        const onEdge = homeWith(b => b.withMyCreep('a', 49, 20, member('melee', SquadState.ENGAGE)).withMyCreep('b', 30, 30, member('ranged', SquadState.ENGAGE)));
        expect(squadTask.decide(task, ctx(onEdge))).toContainEqual(expect.objectContaining({ kind: 'move', creepName: 'a' }));
    });

    test('fights in the target room', () => {
        const target = aRoom('W2N1').withStructure(STRUCTURE_SPAWN, 20, 20, { owner: 'other' })
            .withMyCreep('a', 19, 19, member('melee', SquadState.ENGAGE)).build();
        expect(squadTask.decide(task, ctx(homeWith(), { rooms: [target], creeps: target.creepsPresent, d: directive({ size: 1 }) }))).toContainEqual(
            { kind: 'attack', creepName: 'a', targetId: target.structures[0].id });
    });

    test('defend squads only attack Invader cores among structures', () => {
        const defend: SquadTaskMemory = { ...task, mission: 'defend' };
        const target = aRoom('W2N1').withStructure(STRUCTURE_SPAWN, 20, 20, { owner: 'other' })
            .withMyCreep('a', 19, 19, member('ranged', SquadState.ENGAGE)).build();
        const intents = squadTask.decide(defend, ctx(homeWith(), { rooms: [target], creeps: target.creepsPresent, d: directive({ type: 'defend', size: 1 }) }));
        expect(intents.some(i => i.kind === 'rangedAttack')).toBe(false);
    });

    test('retreats to the rally point when badly hurt', () => {
        const field = aRoom('W2N1').withMyCreep('a', 20, 20, { ...member('melee', SquadState.ENGAGE), hits: 50, hitsMax: 300 }).build();
        const intents = squadTask.decide(task, ctx(homeWith(), { rooms: [field], creeps: field.creepsPresent, d: directive({ size: 1 }) }));
        expect(intents).toContainEqual({ kind: 'setCreepMemory', creepName: 'a', patch: { state: SquadState.RETREAT } });
        expect(intents).toContainEqual({ kind: 'move', creepName: 'a', target: { x: 10, y: 10, roomName: 'W1N1' }, range: 3 });
    });

    test('escorts follow the escorted creeps and engage hostiles near them', () => {
        const escort: SquadTaskMemory = { ...task, mission: 'escort' };
        const d = directive({ type: 'escort', escortedId: 'd9', size: 1 });
        const claimTask: TaskMemory = { name: 'claim', roomName: 'W1N1', type: 'claim', targetRoom: 'W2N1', directiveId: 'd9' };
        const field = aRoom('W2N1')
            .withMyCreep('claimer', 30, 30, { memory: { taskName: 'claim', baseRoomName: 'W1N1', role: 'claimer' } })
            .withMyCreep('a', 20, 20, member('ranged', SquadState.ENGAGE))
            .withHostile(33, 33, { activeParts: { [ATTACK]: 1 } })
            .build();
        const squad = field.creepsPresent.filter(c => c.memory.taskName === 'sq');
        const intents = squadTask.decide(escort, ctx(homeWith(), { rooms: [field], creeps: squad, d, baseTasks: [claimTask] }));
        expect(intents).toContainEqual({ kind: 'move', creepName: 'a', target: field.hostileCreeps[0].pos, range: 3 });
    });
});

describe('home defense squads', () => {
    const homeTask: SquadTaskMemory = { ...task, mission: 'defend', targetRoom: 'W1N1' };
    const homeDirective = directive({ type: 'defend', targetRoom: 'W1N1', size: 3 });

    test('spawn ahead of the economy, melee first, the first one with the energy available now', () => {
        expect(squadTask.getSpawnRequests(homeTask, ctx(homeWith(), { d: homeDirective }))).toEqual([
            { taskName: 'sq', priority: HOME_DEFENSE_PRIORITY, body: SQUAD_BODIES.melee, memory: { role: 'melee' }, urgent: true },
            { taskName: 'sq', priority: HOME_DEFENSE_PRIORITY - 1, body: SQUAD_BODIES.ranged, memory: { role: 'ranged' } },
            { taskName: 'sq', priority: HOME_DEFENSE_PRIORITY - 2, body: SQUAD_BODIES.healer, memory: { role: 'healer' } },
        ]);
    });

    test.each([
        ['dismantlers', { attack: 0, ranged: 0, work: 30, heal: 0 }, ['melee', 'melee', 'melee']],
        ['melee', { attack: 20, ranged: 0, work: 0, heal: 5 }, ['ranged', 'ranged', 'healer']],
        ['ranged', { attack: 0, ranged: 20, work: 0, heal: 5 }, ['melee', 'melee', 'healer']],
        ['mixed', { attack: 10, ranged: 10, work: 0, heal: 0 }, ['melee', 'healer', 'ranged']],
    ])('counters %s', (_, threat, roles) => {
        const requests = squadTask.getSpawnRequests(homeTask, ctx(homeWith(), { d: directive({ ...homeDirective, threat }) }));
        expect(requests.map(r => r.memory?.role).sort()).toEqual([...roles].sort());
    });

    test('a defender fights straight away instead of waiting for the rest of the squad', () => {
        const home = homeWith(b => b.withMyCreep('a', 11, 11, member('melee')).withHostile(20, 20, { owner: 'someone' }));
        const intents = squadTask.decide(homeTask, ctx(home, { d: homeDirective }));
        expect(intents).toContainEqual({ kind: 'setCreepMemory', creepName: 'a', patch: { state: SquadState.ENGAGE } });
        expect(intents.some(i => i.kind === 'move' && i.creepName === 'a' && i.target.x === 20)).toBe(true);
    });

    test('a defend squad for a remote room still rallies', () => {
        const remoteTask: SquadTaskMemory = { ...task, mission: 'defend', targetRoom: 'W2N1' };
        const home = homeWith(b => b.withMyCreep('a', 30, 30, member('ranged')));
        const intents = squadTask.decide(remoteTask, ctx(home, { d: directive({ type: 'defend', size: 2 }) }));
        expect(intents).toContainEqual({ kind: 'setCreepMemory', creepName: 'a', patch: { state: SquadState.RALLY } });
    });
});
