import { describe, expect, test } from '@jest/globals';
import {
    decodeTile, encodeRoute, MAX_REMOTE_ROAD_SITES_PER_ROOM, planRemoteRoads, REMOTE_ROAD_MIN_SPARE,
    REMOTE_ROAD_STABLE_TICKS, remoteRoadStage,
} from './remote_roads';
import { aRoom } from 'testing/builders/room_snapshot_builder';
import { worldOf } from 'testing/builders/world';

describe('remoteRoadStage', () => {
    const base = { tick: 10000, since: 1000, reservedByMe: false, spareIncome: 5 };

    test('none while new, recently attacked, or without spare income', () => {
        expect(remoteRoadStage({ ...base, since: 10000 - REMOTE_ROAD_STABLE_TICKS + 1 })).toBe('none');
        expect(remoteRoadStage({ ...base, hostilesLastSeen: 9000 })).toBe('none');
        expect(remoteRoadStage({ ...base, spareIncome: REMOTE_ROAD_MIN_SPARE - 0.1 })).toBe('none');
    });

    test('swamp tiles once stable, everything once also reserved', () => {
        expect(remoteRoadStage(base)).toBe('swamp');
        expect(remoteRoadStage({ ...base, hostilesLastSeen: 2000 })).toBe('swamp');
        expect(remoteRoadStage({ ...base, reservedByMe: true })).toBe('all');
    });
});

describe('routes', () => {
    test('encode per room without duplicates, and decode tiles', () => {
        const route = encodeRoute([{ x: 1, y: 2, roomName: 'A' }, { x: 3, y: 0, roomName: 'B' }]);
        expect(encodeRoute([{ x: 1, y: 2, roomName: 'A' }, { x: 4, y: 4, roomName: 'A' }], route))
            .toEqual([{ room: 'A', tiles: [101, 204] }, { room: 'B', tiles: [3] }]);
        expect(decodeTile(101)).toEqual({ x: 1, y: 2 });
    });
});

describe('planRemoteRoads', () => {
    const route: RemoteRoute = [
        { room: 'W1N2', tiles: [10 * 50 + 10, 10 * 50 + 11, 10 * 50 + 12, 10 * 50 + 13, 10 * 50 + 14, 0] },
        { room: 'W9N9', tiles: [10 * 50 + 10] },
    ];

    test('places road sites in visible rooms only, skipping edges and existing roads, up to the cap', () => {
        const remote = aRoom('W1N2').withStructure(STRUCTURE_ROAD, 11, 10, { owner: 'none' }).build();
        const intents = planRemoteRoads(route, 'all', worldOf([remote]));
        expect(intents.map(i => [i.pos.x, i.pos.roomName])).toEqual(
            [[10, 'W1N2'], [12, 'W1N2'], [13, 'W1N2']].slice(0, MAX_REMOTE_ROAD_SITES_PER_ROOM));
    });

    test('in the swamp stage, only swamp tiles; none at stage none', () => {
        const remote = aRoom('W1N2').build();
        const world = worldOf([remote], { swamps: { W1N2: new Set(['13_10']) } });
        expect(planRemoteRoads(route, 'swamp', world).map(i => i.pos.x)).toEqual([13]);
        expect(planRemoteRoads(route, 'none', world)).toEqual([]);
    });

    test('existing road sites count toward the per-room cap', () => {
        const remote = aRoom('W1N2').withConstructionSite(STRUCTURE_ROAD, 30, 30).withConstructionSite(STRUCTURE_ROAD, 31, 30).build();
        expect(planRemoteRoads(route, 'all', worldOf([remote]))).toHaveLength(MAX_REMOTE_ROAD_SITES_PER_ROOM - 2);
    });
});
