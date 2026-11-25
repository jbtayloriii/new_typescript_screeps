import { describe, expect, test } from '@jest/globals';
import { autoDefendSize, BaseSummary, DEFEND_CLEAR_TICKS, DirectivePlanInput, MAX_DIRECTIVE_DISTANCE, MILITARY_MIN_CAPACITY, planDirectives } from './planning';
import { Directive } from './types';
import { aRoom } from 'testing/builders/room_snapshot_builder';
import { worldOf, WorldOptions } from 'testing/builders/world';
import { RoomIntel } from 'intel/types';
import { HOME_DEFENSE_CANCEL_COOLDOWN } from 'military/home_defense';

const base = (roomName: string, overrides: Partial<BaseSummary> = {}): BaseSummary =>
    ({ roomName, energyCapacity: 800, staticMining: false, rcl: 3, storageEnergy: 0, underAttack: false, ...overrides });
const directive = (overrides: Partial<Directive>): Directive =>
    ({ id: 'd0', type: 'scout', targetRoom: 'W5N5', source: 'manual', status: 'pending', createdAt: 10, ...overrides });
const intel = (overrides: Partial<RoomIntel> = {}): RoomIntel => ({
    lastSeen: 1, sources: [{ id: 's' as Id<Source>, x: 20, y: 20 }],
    controller: { x: 25, y: 25, level: 0 }, keeperLairs: 0, hostileCombatCreeps: 0, ...overrides,
});

function input(overrides: Partial<DirectivePlanInput> & { worldOpts?: WorldOptions } = {}): DirectivePlanInput {
    const { worldOpts, ...rest } = overrides;
    return {
        world: worldOf([aRoom('W1N1').withTick(100).build()], worldOpts),
        directives: [],
        bases: [base('W1N1')],
        intel: {},
        ...rest,
    };
}

describe('planDirectives: flags', () => {
    const flag = { name: 'mine-here', color: COLOR_YELLOW, secondaryColor: COLOR_WHITE, pos: { x: 1, y: 1, roomName: 'W1N2' } };

    test('new directive flags create directives, once', () => {
        expect(planDirectives(input({ worldOpts: { flags: [flag] } })).create).toEqual([
            { type: 'remoteMine', targetRoom: 'W1N2', source: 'flag', flagName: 'mine-here', spawnPos: undefined },
        ]);
        const existing = directive({ type: 'remoteMine', targetRoom: 'W1N2', source: 'flag', flagName: 'mine-here', status: 'active' });
        expect(planDirectives(input({ worldOpts: { flags: [flag] }, directives: [existing] })).create).toEqual([]);
    });

    test('removing the flag cancels its directive', () => {
        const existing = directive({ source: 'flag', flagName: 'gone', status: 'active', baseRoomName: 'W1N1' });
        expect(planDirectives(input({ directives: [existing] })).end).toEqual([{ id: 'd0', status: 'cancelled', reason: 'flag removed' }]);
    });

    test('finishing a flag directive removes the flag', () => {
        const scoutFlag = { ...flag, name: 'look', color: COLOR_WHITE, pos: { x: 1, y: 1, roomName: 'W5N5' } };
        const existing = directive({ source: 'flag', flagName: 'look', status: 'active', baseRoomName: 'W1N1' });
        const changes = planDirectives(input({ directives: [existing], intel: { W5N5: intel({ lastSeen: 50 }) }, worldOpts: { flags: [scoutFlag] } }));
        expect(changes.end).toEqual([{ id: 'd0', status: 'done', reason: 'scouted' }]);
        expect(changes.intents).toEqual([{ kind: 'removeFlag', flagName: 'look' }]);
    });
});

describe('planDirectives: finishing', () => {
    test('scouts finish once the room is seen after the directive was created', () => {
        const d = directive({ status: 'active', baseRoomName: 'W1N1', createdAt: 10 });
        expect(planDirectives(input({ directives: [d], intel: { W5N5: intel({ lastSeen: 9 }) } })).end).toEqual([]);
        expect(planDirectives(input({ directives: [d], intel: { W5N5: intel({ lastSeen: 10 }) } })).end).toHaveLength(1);
    });

    test('remote mining ends when the room becomes unusable, not for missing intel', () => {
        const d = directive({ type: 'remoteMine', status: 'active', baseRoomName: 'W1N1' });
        expect(planDirectives(input({ directives: [d] })).end).toEqual([]);
        expect(planDirectives(input({ directives: [d], intel: { W5N5: intel({ keeperLairs: 2 }) } })).end)
            .toEqual([{ id: 'd0', status: 'done', reason: "can't remote mine: source keepers" }]);
    });

    test('a claim whose room becomes a base hands its creeps over and incubates it', () => {
        const d = directive({ type: 'claim', targetRoom: 'W2N1', status: 'active', baseRoomName: 'W1N1', phase: 'building' });
        const newBase = aRoom('W2N1').withRcl(1).withSpawn(20, 20)
            .withMyCreep('pioneer1', 10, 10, { memory: { taskName: 'c', baseRoomName: 'W1N1', role: 'pioneer' } })
            .withMyCreep('other', 11, 11, { memory: { taskName: 'x', baseRoomName: 'W1N1' } }).build();
        const changes = planDirectives({ ...input({ directives: [d] }), bases: [base('W1N1'), base('W2N1')], world: worldOf([newBase]) });

        expect(changes.end).toEqual([]);
        expect(changes.update).toEqual([{ id: 'd0', patch: { phase: 'incubating', reason: 'incubating: RCL 1 of 3, then a tower' } }]);
        expect(changes.handoffs).toEqual([{ creepName: 'pioneer1', baseRoomName: 'W2N1' }]);
    });

    test('incubation is done once the new base has RCL 3 and a tower', () => {
        const d = directive({ type: 'claim', targetRoom: 'W2N1', status: 'active', baseRoomName: 'W1N1', phase: 'incubating' });
        const run = (room: ReturnType<ReturnType<typeof aRoom>['build']>) =>
            planDirectives({ ...input({ directives: [d] }), bases: [base('W1N1'), base('W2N1')], world: worldOf([room]) }).end;
        expect(run(aRoom('W2N1').withRcl(3).withSpawn(20, 20).build())).toEqual([]);
        expect(run(aRoom('W2N1').withRcl(2).withSpawn(20, 20).withTower(22, 22).build())).toEqual([]);
        expect(run(aRoom('W2N1').withRcl(3).withSpawn(20, 20).withTower(22, 22).build()))
            .toEqual([{ id: 'd0', status: 'done', reason: 'incubated: RCL 3 with a tower' }]);
    });

    test('an incubating claim whose new base is gone ends', () => {
        const d = directive({ type: 'claim', targetRoom: 'W2N1', status: 'active', baseRoomName: 'W1N1', phase: 'incubating' });
        expect(planDirectives(input({ directives: [d] })).end).toEqual([{ id: 'd0', status: 'done', reason: 'new base lost' }]);
    });

    test('claims fail when someone else owns the room', () => {
        const d = directive({ type: 'claim', status: 'active', baseRoomName: 'W1N1' });
        const owned = intel({ controller: { x: 1, y: 1, level: 3, owner: 'them' } });
        expect(planDirectives(input({ directives: [d], intel: { W5N5: owned } })).end).toEqual([{ id: 'd0', status: 'done', reason: 'owned by them' }]);
    });
});

describe('planDirectives: assigning bases', () => {
    test('pending directives go to the closest base', () => {
        const d = directive({ targetRoom: 'W4N1' });
        const changes = planDirectives(input({ directives: [d], bases: [base('W1N1'), base('W3N1')] }));
        expect(changes.update).toContainEqual({ id: 'd0', patch: { status: 'active', baseRoomName: 'W3N1', reason: undefined } });
    });

    test('waits, with a reason, when no base is close enough', () => {
        const far = directive({ targetRoom: `W${MAX_DIRECTIVE_DISTANCE + 2}N1` });
        expect(planDirectives(input({ directives: [far] })).update).toEqual([{ id: 'd0', patch: { reason: `no base within ${MAX_DIRECTIVE_DISTANCE} rooms` } }]);
    });

    test('claims need spare GCL; any base can take one (readiness is checked before claiming)', () => {
        const claim = directive({ type: 'claim', targetRoom: 'W2N1' });
        const lowGcl = planDirectives(input({ directives: [claim], worldOpts: { gclLevel: 1, ownedRooms: ['W1N1'] } }));
        expect(lowGcl.update[0].patch.reason).toContain('GCL 1');

        const small = planDirectives(input({ directives: [claim], bases: [base('W1N1', { energyCapacity: 300 })], worldOpts: { gclLevel: 2, ownedRooms: ['W1N1'] } }));
        expect(small.update).toContainEqual({ id: 'd0', patch: { status: 'active', baseRoomName: 'W1N1', reason: undefined } });
    });
});

describe('planDirectives: claim phases', () => {
    const claim = (overrides: Partial<Directive> = {}) =>
        directive({ type: 'claim', targetRoom: 'W2N1', status: 'active', baseRoomName: 'W1N1', ...overrides });
    const ready = base('W1N1', { rcl: 4, energyCapacity: 1300, storageEnergy: 20000 });
    const fresh = intel({ lastSeen: 50 });

    test('a new claim scouts its room first', () => {
        expect(planDirectives(input({ directives: [claim()] })).update)
            .toEqual([{ id: 'd0', patch: { phase: 'scouting', reason: 'scouting the room' } }]);
    });

    test('with fresh intel it is evaluated once, then waits for the base to be ready', () => {
        const changes = planDirectives(input({ directives: [claim()], intel: { W2N1: fresh } }));
        const patch = changes.update[0].patch;
        expect(patch.phase).toBe('evaluating');
        expect(patch.reason).toBe('waiting: base RCL 3 < 4');
        expect(patch.route).toEqual(['W2N1']);
        expect(patch.spawnPos).toEqual(patch.evaluation!.spawnPos);
        expect(patch.evaluation).toMatchObject({ extensionStamps: 12, routeRooms: 1 });
    });

    test('a ready base sends the claimer', () => {
        const changes = planDirectives(input({ directives: [claim()], bases: [ready], intel: { W2N1: fresh } }));
        expect(changes.update[0].patch).toMatchObject({ phase: 'claiming', spawnPos: expect.any(Object) });
    });

    test('hard blockers cancel the claim', () => {
        const owned = intel({ lastSeen: 50, controller: { x: 25, y: 25, level: 3, owner: 'someone' } });
        expect(planDirectives(input({ directives: [claim({ phase: 'evaluating' })], intel: { W2N1: owned } })).end)
            .toEqual([{ id: 'd0', status: 'done', reason: 'owned by someone' }]);
        const noRoute = input({ directives: [claim()], intel: { W2N1: fresh }, worldOpts: { routes: { 'W1N1>W2N1': null } } });
        expect(planDirectives(noRoute).end).toEqual([{ id: 'd0', status: 'cancelled', reason: 'no route that avoids other players\' rooms' }]);
    });
});

describe('planDirectives: automatic remote mining', () => {
    const exits = { W1N1: ['W1N2', 'W2N1'] };
    const good = { W1N2: intel(), W2N1: intel() };

    test('static bases get remote directives up to their limit', () => {
        const changes = planDirectives(input({ bases: [base('W1N1', { staticMining: true })], intel: good, worldOpts: { exits } }));
        expect(changes.create).toEqual([{ type: 'remoteMine', targetRoom: 'W1N2', source: 'auto', baseRoomName: 'W1N1' }]);
    });

    test('not for bases still harvesting', () => {
        expect(planDirectives(input({ intel: good, worldOpts: { exits } })).create).toEqual([]);
    });

    test('manual remotes count against the limit, and cancelled rooms are not retaken', () => {
        const manual = directive({ type: 'remoteMine', targetRoom: 'W2N1', status: 'active', baseRoomName: 'W1N1' });
        const statics = [base('W1N1', { staticMining: true })];
        expect(planDirectives(input({ bases: statics, directives: [manual], intel: good, worldOpts: { exits } })).create).toEqual([]);

        const cancelled = directive({ type: 'remoteMine', targetRoom: 'W1N2', status: 'cancelled' });
        expect(planDirectives(input({ bases: statics, directives: [cancelled], intel: good, worldOpts: { exits } })).create)
            .toEqual([{ type: 'remoteMine', targetRoom: 'W2N1', source: 'auto', baseRoomName: 'W1N1' }]);
    });
});

describe('planDirectives: military', () => {
    test('attack is done once the room is seen with no hostile structures or combat creeps', () => {
        const d = directive({ type: 'attack', status: 'active', baseRoomName: 'W1N1', createdAt: 10 });
        expect(planDirectives(input({ directives: [d], intel: { W5N5: intel({ lastSeen: 50, hostileStructures: 2 }) } })).end).toEqual([]);
        expect(planDirectives(input({ directives: [d], intel: { W5N5: intel({ lastSeen: 50, hostileStructures: 0 }) } })).end)
            .toEqual([{ id: 'd0', status: 'done', reason: 'target cleared' }]);
    });

    test('defend is done once the room has been clear for a while', () => {
        const d = directive({ type: 'defend', status: 'active', baseRoomName: 'W1N1', createdAt: 10 });
        const recent = intel({ lastSeen: 95, hostilesLastSeen: 50 });
        expect(planDirectives(input({ directives: [d], intel: { W5N5: recent } })).end).toEqual([]);
        const world = worldOf([aRoom('W1N1').withTick(50 + DEFEND_CLEAR_TICKS).build()]);
        expect(planDirectives({ ...input({ directives: [d], intel: { W5N5: recent } }), world }).end)
            .toEqual([{ id: 'd0', status: 'done', reason: 'room clear' }]);
    });

    test('escort runs from the escorted directive\'s base and ends with it', () => {
        const claim = directive({ id: 'd1', type: 'claim', targetRoom: 'W2N1', status: 'active', baseRoomName: 'W3N3' });
        const escort = directive({ id: 'd2', type: 'escort', targetRoom: 'W2N1', escortedId: 'd1' });
        expect(planDirectives(input({ directives: [claim, escort], bases: [base('W1N1'), base('W3N3')] })).update)
            .toContainEqual({ id: 'd2', patch: { status: 'active', baseRoomName: 'W3N3', reason: undefined } });
        const ended = { ...claim, status: 'done' as const };
        expect(planDirectives(input({ directives: [ended, { ...escort, status: 'active', baseRoomName: 'W3N3' }] })).end)
            .toEqual([{ id: 'd2', status: 'done', reason: 'escorted directive ended' }]);
    });

    test('military directives need a base with enough energy capacity', () => {
        const d = directive({ type: 'attack', targetRoom: 'W2N1' });
        const poor = planDirectives(input({ directives: [d], bases: [base('W1N1', { energyCapacity: MILITARY_MIN_CAPACITY - 1 })] }));
        expect(poor.update[0].patch.reason).toContain(`${MILITARY_MIN_CAPACITY} energy capacity`);
    });

    test('remote rooms with NPC invaders or a core get an automatic defend directive, once', () => {
        const remote = directive({ id: 'd1', type: 'remoteMine', targetRoom: 'W1N2', status: 'active', baseRoomName: 'W1N1' });
        const invaded = intel({ lastSeen: 100, hostileCombatCreeps: 2, hostilesLastSeen: 90, hostileOwners: ['Invader'] });
        expect(planDirectives(input({ directives: [remote], intel: { W1N2: invaded } })).create).toEqual([
            { type: 'defend', targetRoom: 'W1N2', source: 'auto', baseRoomName: 'W1N1', size: 3 },
        ]);
        expect(planDirectives(input({ directives: [remote], intel: { W1N2: intel({ invaderCores: 1 }) } })).create)
            .toEqual([{ type: 'defend', targetRoom: 'W1N2', source: 'auto', baseRoomName: 'W1N1', size: 2 }]);

        const alreadyDefended = directive({ id: 'd2', type: 'defend', targetRoom: 'W1N2', status: 'active', baseRoomName: 'W1N1' });
        expect(planDirectives(input({ directives: [remote, alreadyDefended], intel: { W1N2: invaded } })).create).toEqual([]);
    });

    test('players are not auto-defended against', () => {
        const remote = directive({ id: 'd1', type: 'remoteMine', targetRoom: 'W1N2', status: 'active', baseRoomName: 'W1N1' });
        const player = intel({ lastSeen: 100, hostileCombatCreeps: 2, hostilesLastSeen: 90, hostileOwners: ['someone'] });
        expect(planDirectives(input({ directives: [remote], intel: { W1N2: player } })).create).toEqual([]);
        expect(autoDefendSize({ hostileCombatCreeps: 9 })).toBe(4);
    });
});


describe('planDirectives: home defense against players', () => {
    const dismantler = { activeParts: { [WORK]: 10, [MOVE]: 10 }, hits: 2000, hitsMax: 2000, owner: 'someone' };
    const attacked = (tick = 100) => worldOf([aRoom('W1N1').withTick(tick).withRcl(3).withSpawn(10, 10)
        .withHostile(12, 12, dismantler).withHostile(13, 13, dismantler).build()]);
    const quiet = (tick: number) => worldOf([aRoom('W1N1').withTick(tick).withRcl(3).withSpawn(10, 10).build()]);
    const homeDefense = (overrides: Partial<Directive> = {}) => directive({
        id: 'd1', type: 'defend', targetRoom: 'W1N1', source: 'auto', status: 'active', baseRoomName: 'W1N1',
        size: 2, createdAt: 50, lastThreatAt: 90, ...overrides,
    });

    test('player attackers the towers can\'t handle get a defend directive for the base itself', () => {
        expect(planDirectives(input({ world: attacked() })).create).toEqual([
            {
                type: 'defend', targetRoom: 'W1N1', source: 'auto', baseRoomName: 'W1N1', size: 5, lastThreatAt: 100,
                threat: { attack: 0, ranged: 0, work: 20, heal: 0 },
                reason: 'under attack: 2 attackers (someone; dismantlers); no tower can out-damage them',
            },
        ]);
    });

    test('no directive when the towers can kill them quickly, or for NPC invaders', () => {
        const towers = worldOf([aRoom('W1N1').withTick(100).withRcl(3).withSpawn(10, 10).withTower(11, 11)
            .withHostile(12, 12, dismantler).build()]);
        expect(planDirectives(input({ world: towers })).create).toEqual([]);
        const invaders = worldOf([aRoom('W1N1').withTick(100).withRcl(3).withHostile(12, 12, { ...dismantler, owner: 'Invader' }).build()]);
        expect(planDirectives(input({ world: invaders })).create).toEqual([]);
    });

    test('while attackers are there, the existing directive records them and grows', () => {
        const changes = planDirectives(input({ world: attacked(120), directives: [homeDefense()] }));
        expect(changes.create).toEqual([]);
        expect(changes.update).toEqual([{ id: 'd1', patch: { lastThreatAt: 120, size: 5, threat: { attack: 0, ranged: 0, work: 20, heal: 0 } } }]);
        expect(changes.end).toEqual([]);
    });

    test('keeps the strongest threat as attackers die, and adds new kinds', () => {
        const seen = { attack: 0, ranged: 0, work: 40, heal: 0 };
        // 20 WORK left of the 40 seen: nothing to update but the clock.
        expect(planDirectives(input({ world: attacked(130), directives: [homeDefense({ size: 5, threat: seen })] })).update)
            .toEqual([{ id: 'd1', patch: { lastThreatAt: 130 } }]);
        const melee = worldOf([aRoom('W1N1').withTick(140).withRcl(3).withSpawn(10, 10)
            .withHostile(12, 12, { activeParts: { [ATTACK]: 10, [MOVE]: 10 }, owner: 'someone' }).build()]);
        expect(planDirectives(input({ world: melee, directives: [homeDefense({ size: 5, threat: seen })] })).update)
            .toEqual([{ id: 'd1', patch: { lastThreatAt: 140, threat: { attack: 10, ranged: 0, work: 40, heal: 0 } } }]);
    });

    test('ends once the base has been clear for DEFEND_CLEAR_TICKS', () => {
        expect(planDirectives(input({ world: quiet(90 + DEFEND_CLEAR_TICKS - 1), directives: [homeDefense()] })).end).toEqual([]);
        expect(planDirectives(input({ world: quiet(90 + DEFEND_CLEAR_TICKS), directives: [homeDefense()] })).end)
            .toEqual([{ id: 'd1', status: 'done', reason: 'base clear' }]);
    });

    test('a home defense cancelled from the console is not recreated for a while', () => {
        const cancelled = homeDefense({ status: 'cancelled', endedAt: 95 });
        expect(planDirectives(input({ world: attacked(100), directives: [cancelled] })).create).toEqual([]);
        expect(planDirectives(input({ world: attacked(95 + HOME_DEFENSE_CANCEL_COOLDOWN), directives: [cancelled] })).create).toHaveLength(1);
    });
});
