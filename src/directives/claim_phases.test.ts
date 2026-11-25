import { describe, expect, test } from '@jest/globals';
import { assessClaim, ClaimBase, MAX_CLAIM_ATTEMPTS, planClaimPhase } from './claim_phases';
import { Directive } from './types';
import { IntelMap, RoomIntel } from 'intel/types';
import { aRoom } from 'testing/builders/room_snapshot_builder';
import { worldOf, WorldOptions } from 'testing/builders/world';

const base: ClaimBase = { roomName: 'W1N1', rcl: 4, energyCapacity: 1300, storageEnergy: 20000, underAttack: false };
const claim = (overrides: Partial<Directive> = {}): Directive => ({
    id: 'd1', type: 'claim', targetRoom: 'W2N1', source: 'manual', status: 'active', createdAt: 10, baseRoomName: 'W1N1', ...overrides,
});
const intel = (overrides: Partial<RoomIntel> = {}): RoomIntel => ({
    lastSeen: 50, sources: [{ id: 's1' as Id<Source>, x: 10, y: 10 }, { id: 's2' as Id<Source>, x: 40, y: 40 }],
    controller: { x: 25, y: 25, level: 0 }, keeperLairs: 0, hostileCombatCreeps: 0, ...overrides,
});
function ctx(opts: { intel?: RoomIntel, rooms?: ReturnType<ReturnType<typeof aRoom>['build']>[], world?: WorldOptions, directives?: Directive[] } = {}) {
    const intelMap: IntelMap = opts.intel ? { W2N1: opts.intel } : {};
    return {
        world: worldOf(opts.rooms ?? [aRoom('W1N1').withTick(100).build()], opts.world),
        intel: intelMap,
        directives: opts.directives ?? [],
    };
}

describe('planClaimPhase', () => {
    test('stays scouting until intel is newer than the claim', () => {
        expect(planClaimPhase(claim(), base, ctx({ intel: intel({ lastSeen: 5 }) })).patch).toEqual({ phase: 'scouting', reason: 'scouting the room' });
    });

    test('evaluates once: the saved route and evaluation are reused', () => {
        const first = planClaimPhase(claim(), base, ctx({ intel: intel() }));
        expect(first.patch.phase).toBe('claiming');
        const again = planClaimPhase(claim({ ...first.patch, phase: 'evaluating' }), base, ctx({ intel: intel() }));
        expect(again.patch).toEqual({ phase: 'claiming' });
    });

    test('a given spawn tile is kept', () => {
        const result = planClaimPhase(claim({ spawnPos: { x: 30, y: 30 } }), base, ctx({ intel: intel() }));
        expect(result.patch.spawnPos).toBeUndefined();
        expect(result.patch.evaluation?.spawnPos).toEqual({ x: 30, y: 30 });
    });

    test('holds for player hostiles and for base readiness, unless forced', () => {
        const hostile = intel({ hostileOwners: ['them'], hostileCombatCreeps: 1, hostilesLastSeen: 90 });
        expect(planClaimPhase(claim(), base, ctx({ intel: hostile })).patch).toMatchObject({ phase: 'evaluating', reason: expect.stringContaining('player hostiles') });
        const poor = { ...base, storageEnergy: 0 };
        expect(planClaimPhase(claim(), poor, ctx({ intel: intel() })).patch).toMatchObject({ phase: 'evaluating', reason: 'waiting: base storage 0 < 10000 energy' });
        expect(planClaimPhase(claim({ force: true }), poor, ctx({ intel: intel() })).patch.phase).toBe('claiming');
    });

    test('one claim at a time per base', () => {
        const other = claim({ id: 'd0', targetRoom: 'W3N1', phase: 'building' });
        expect(planClaimPhase(claim(), base, ctx({ intel: intel(), directives: [other] })).patch.reason).toBe('waiting: base is already running claim d0');
    });

    test('counts claimers and cancels after MAX_CLAIM_ATTEMPTS have died', () => {
        const claimer = (name: string) => aRoom('W1N1').withTick(100).withMyCreep(name, 1, 1, { memory: { taskName: 't', baseRoomName: 'W1N1', role: 'claimer', targetRoom: 'W2N1' } }).build();
        const claiming = claim({ phase: 'claiming', claimAttempts: 1, lastClaimer: 'a' });
        expect(planClaimPhase(claiming, base, ctx({ intel: intel(), rooms: [claimer('b')] })).patch).toEqual({ claimAttempts: 2, lastClaimer: 'b' });
        expect(planClaimPhase(claiming, base, ctx({ intel: intel(), rooms: [claimer('a')] })).patch).toEqual({});
        const spent = claim({ phase: 'claiming', claimAttempts: MAX_CLAIM_ATTEMPTS, lastClaimer: 'c' });
        expect(planClaimPhase(spent, base, ctx({ intel: intel() })).cancel).toBe('claimer died 3 times');
    });

    test('a claim whose controller is already mine goes straight to building', () => {
        const mine = intel({ controller: { x: 25, y: 25, level: 1, owner: 'me' } });
        const result = planClaimPhase(claim(), { ...base, rcl: 2 }, ctx({ intel: mine }));
        expect(result.patch.phase).toBe('building');
        const claiming = planClaimPhase(claim({ phase: 'claiming' }), base, ctx({ intel: mine }));
        expect(claiming.patch).toEqual({ phase: 'building', claimedAt: 100 });
    });
});

describe('assessClaim', () => {
    test('no intel: scout first', () => {
        expect(assessClaim('W2N1', base, ctx())).toEqual({ noIntel: true });
    });

    test('routes around other players\' rooms', () => {
        const theirs: RoomIntel = { ...intel(), controller: { x: 1, y: 1, level: 5, owner: 'them' } };
        const c = ctx({ intel: intel(), world: { routes: { 'W1N1>W2N1': ['W1N2', 'W2N1'] } } });
        expect(assessClaim('W2N1', base, c)).toMatchObject({ route: ['W1N2', 'W2N1'] });
        const blocked = { ...c, intel: { ...c.intel, W1N2: theirs } };
        expect(assessClaim('W2N1', base, blocked)).toEqual({ cancel: 'no route that avoids other players\' rooms' });
    });
});
