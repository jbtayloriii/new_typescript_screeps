import { describe, expect, test } from '@jest/globals';
import { chooseNewRemoteRooms, maxRemoteRooms, remoteBlocker, RemoteChoiceInput, REMOTE_HOSTILE_AVOID_TICKS } from './remote_selection';
import { RoomIntel } from 'intel/types';

const room = (overrides: Partial<RoomIntel> = {}): RoomIntel => ({
    lastSeen: 1,
    sources: [{ id: 's1' as Id<Source>, x: 10, y: 10 }],
    controller: { x: 25, y: 25, level: 0 },
    keeperLairs: 0,
    hostileCombatCreeps: 0,
    ...overrides,
});

describe('remoteBlocker', () => {
    test('accepts unowned rooms with sources, or rooms I reserve', () => {
        expect(remoteBlocker(room(), 'me')).toBeNull();
        expect(remoteBlocker(room({ controller: { x: 1, y: 1, level: 0, reservedBy: 'me' } }), 'me')).toBeNull();
    });

    test("an Invader core's reservation doesn't end a remote (it pauses it instead)", () => {
        expect(remoteBlocker(room({ controller: { x: 1, y: 1, level: 0, reservedBy: 'Invader' } }), 'me')).toBeNull();
    });

    test('rejects unusable rooms', () => {
        expect(remoteBlocker(undefined, 'me')).toBe('no intel');
        expect(remoteBlocker(room({ sources: [] }), 'me')).toBe('no sources');
        expect(remoteBlocker(room({ keeperLairs: 1 }), 'me')).toBe('source keepers');
        expect(remoteBlocker(room({ controller: undefined }), 'me')).toBe('no controller');
        expect(remoteBlocker(room({ controller: { x: 1, y: 1, level: 3, owner: 'them' } }), 'me')).toBe('owned');
        expect(remoteBlocker(room({ controller: { x: 1, y: 1, level: 0, reservedBy: 'them' } }), 'me')).toBe('reserved by another player');
    });
});

describe('chooseNewRemoteRooms', () => {
    const base: RemoteChoiceInput = {
        energyCapacity: 1300, neighbors: ['A', 'B', 'C'], myUsername: 'me', tick: 10000, current: [], unavailable: [],
        intel: {
            A: room(),
            B: room({ sources: [{ id: 'x' as Id<Source>, x: 1, y: 1 }, { id: 'y' as Id<Source>, x: 2, y: 2 }] }),
            C: room({ hostilesLastSeen: 10000 - REMOTE_HOSTILE_AVOID_TICKS + 1 }),
        },
    };

    test('prefers rooms with more sources, up to the capacity limit, skipping recent hostiles', () => {
        expect(maxRemoteRooms(799)).toBe(0);
        expect(chooseNewRemoteRooms(base)).toEqual(['B', 'A']);
        expect(chooseNewRemoteRooms({ ...base, energyCapacity: 800 })).toEqual(['B']);
    });

    test('does not pick rooms reserved by an Invader core', () => {
        const invaded = { ...base, intel: { ...base.intel, B: room({ controller: { x: 1, y: 1, level: 0, reservedBy: 'Invader' } }) } };
        expect(chooseNewRemoteRooms(invaded)).toEqual(['A']);
    });

    test('counts current remotes against the limit and skips rooms other bases use', () => {
        expect(chooseNewRemoteRooms({ ...base, current: ['A'] })).toEqual(['B']);
        expect(chooseNewRemoteRooms({ ...base, unavailable: ['B'] })).toEqual(['A']);
        expect(chooseNewRemoteRooms({ ...base, current: ['A', 'B'] })).toEqual([]);
    });
});
