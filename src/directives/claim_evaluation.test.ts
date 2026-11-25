import { describe, expect, test } from '@jest/globals';
import { checkClaimRoom, claimBaseNotReady, ClaimBaseState, PLAYER_HOSTILE_RECENT_TICKS, RoomCheckInput } from './claim_evaluation';
import { RoomIntel } from 'intel/types';

const intel = (overrides: Partial<RoomIntel> = {}): RoomIntel => ({
    lastSeen: 100, sources: [{ id: 's' as Id<Source>, x: 10, y: 10 }], controller: { x: 25, y: 25, level: 0 },
    keeperLairs: 0, hostileCombatCreeps: 0, ...overrides,
});
const check = (overrides: Partial<RoomCheckInput> = {}) => checkClaimRoom({
    intel: intel(), myUsername: 'me', tick: 1000, targetStatus: 'normal', baseStatus: 'normal', route: ['W2N1'], ...overrides,
});

describe('checkClaimRoom', () => {
    test('passes a free room', () => {
        expect(check()).toBeNull();
    });

    test('cancels rooms that can never be claimed from here', () => {
        expect(check({ intel: intel({ controller: undefined }) })).toEqual({ cancel: 'room has no controller' });
        expect(check({ intel: intel({ controller: { x: 1, y: 1, level: 4, owner: 'them' } }) })).toEqual({ cancel: 'owned by them' });
        expect(check({ targetStatus: 'novice' })).toEqual({ cancel: 'room is novice and the base is normal' });
        expect(check({ route: null })).toEqual({ cancel: 'no route that avoids other players\' rooms' });
    });

    test('holds while player hostiles were seen recently, but not for invaders or reservations', () => {
        const players = intel({ hostileOwners: ['them'], hostileCombatCreeps: 2, hostilesLastSeen: 900 });
        expect(check({ intel: players })).toEqual({ hold: 'player hostiles (them) in the room, use cmd.escort' });
        expect(check({ intel: players, tick: 900 + PLAYER_HOSTILE_RECENT_TICKS })).toBeNull();
        expect(check({ intel: intel({ hostileStructures: 2, invaderCores: 1 }) })).toMatchObject({ hold: expect.any(String) });
        expect(check({ intel: intel({ hostileOwners: ['Invader'], hostilesLastSeen: 990, invaderCores: 1, hostileStructures: 1 }) })).toBeNull();
        expect(check({ intel: intel({ controller: { x: 1, y: 1, level: 0, reservedBy: 'them' } }) })).toBeNull();
    });
});

describe('claimBaseNotReady', () => {
    const ready: ClaimBaseState = { roomName: 'W1N1', rcl: 4, energyCapacity: 1300, storageEnergy: 10000, underAttack: false, routeRooms: 2 };

    test('a ready base', () => {
        expect(claimBaseNotReady(ready)).toBeNull();
    });

    test('says what is missing', () => {
        expect(claimBaseNotReady({ ...ready, rcl: 2 })).toBe('base RCL 2 < 4');
        expect(claimBaseNotReady({ ...ready, energyCapacity: 800 })).toBe('base energy capacity 800 < 1300');
        expect(claimBaseNotReady({ ...ready, storageEnergy: 500 })).toBe('base storage 500 < 10000 energy');
        expect(claimBaseNotReady({ ...ready, underAttack: true })).toBe('base is under attack');
        expect(claimBaseNotReady({ ...ready, otherClaim: 'd4' })).toBe('base is already running claim d4');
        expect(claimBaseNotReady({ ...ready, routeRooms: 10 })).toBe('route is ~500 ticks, too long for a claimer (500)');
    });
});
