import { CreateConstructionSiteIntent } from "intents/types";
import { RoomSnapshot } from "snapshot/types";
import { TerrainView, WorldSnapshot } from "snapshot/world";

/**
 * Roads to remote rooms, built in stages (see ROADMAP phase 3, item 7):
 * - 'none' while a remote is new: remotes get lost, so roads would be wasted energy.
 * - 'swamp' once it has held for REMOTE_ROAD_STABLE_TICKS without hostiles and the base has spare
 *   income: swamp tiles pay back fastest (a loaded [CARRY, MOVE] hauler takes 5 ticks per swamp
 *   tile without a road).
 * - 'all' once it's also reserved, which doubles traffic and so roughly halves the payback.
 */
export type RemoteRoadStage = 'none' | 'swamp' | 'all';

export const REMOTE_ROAD_STABLE_TICKS = 3000;
/** Spare income (energy/tick) the base needs before it spends energy on remote roads. */
export const REMOTE_ROAD_MIN_SPARE = 2;
/** At most this many road sites per room at a time for one remote's route. */
export const MAX_REMOTE_ROAD_SITES_PER_ROOM = 3;

export interface RoadStageInput {
    readonly tick: number;
    /** When the remote started (its directive's creation tick). */
    readonly since: number;
    readonly hostilesLastSeen?: number;
    readonly reservedByMe: boolean;
    readonly spareIncome: number;
}

export function remoteRoadStage(input: RoadStageInput): RemoteRoadStage {
    const quietSince = Math.max(input.since, input.hostilesLastSeen ?? -Infinity);
    const stable = input.tick - quietSince >= REMOTE_ROAD_STABLE_TICKS;
    if (!stable || input.spareIncome < REMOTE_ROAD_MIN_SPARE) {
        return 'none';
    }
    return input.reservedByMe ? 'all' : 'swamp';
}

/** Encodes a path as a route: per room, tile indexes (y * 50 + x), without duplicates. */
export function encodeRoute(path: readonly { x: number, y: number, roomName: RoomName }[], existing: RemoteRoute = []): RemoteRoute {
    const byRoom = new Map<RoomName, Set<number>>(existing.map(segment => [segment.room, new Set(segment.tiles)]));
    for (const pos of path) {
        if (!byRoom.has(pos.roomName)) {
            byRoom.set(pos.roomName, new Set());
        }
        byRoom.get(pos.roomName)!.add(pos.y * 50 + pos.x);
    }
    return [...byRoom].map(([room, tiles]) => ({ room, tiles: [...tiles] }));
}

export function decodeTile(index: number): { x: number, y: number } {
    return { x: index % 50, y: Math.floor(index / 50) };
}

/**
 * Road sites to place for a remote's route at the given stage: only in visible rooms, skipping
 * room edges, tiles with a road or road site, and (in the 'swamp' stage) non-swamp tiles. At
 * most MAX_REMOTE_ROAD_SITES_PER_ROOM road sites per room at a time, counting existing ones.
 */
export function planRemoteRoads(route: RemoteRoute, stage: RemoteRoadStage, world: WorldSnapshot): CreateConstructionSiteIntent[] {
    if (stage === 'none') {
        return [];
    }
    const intents: CreateConstructionSiteIntent[] = [];
    for (const segment of route) {
        const room = world.getRoom(segment.room);
        if (!room) {
            continue;
        }
        const terrain = world.getTerrain(segment.room);
        let sites = room.constructionSites.filter(s => s.structureType === STRUCTURE_ROAD).length;
        for (const index of segment.tiles) {
            if (sites >= MAX_REMOTE_ROAD_SITES_PER_ROOM) {
                break;
            }
            const { x, y } = decodeTile(index);
            if (!needsRoad(room, terrain, x, y, stage)) {
                continue;
            }
            intents.push({ kind: 'createConstructionSite', pos: { x, y, roomName: segment.room }, structureType: STRUCTURE_ROAD });
            sites++;
        }
    }
    return intents;
}

function needsRoad(room: RoomSnapshot, terrain: TerrainView, x: number, y: number, stage: RemoteRoadStage): boolean {
    if (x <= 0 || y <= 0 || x >= 49 || y >= 49 || terrain.isWall(x, y)) {
        return false;
    }
    if (stage === 'swamp' && !terrain.isSwamp(x, y)) {
        return false;
    }
    const at = (s: { pos: { x: number, y: number }, structureType: string }) =>
        s.structureType === STRUCTURE_ROAD && s.pos.x === x && s.pos.y === y;
    return !room.structures.some(at) && !room.constructionSites.some(at);
}
