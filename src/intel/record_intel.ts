import { RoomSnapshot } from "snapshot/types";
import { WorldSnapshot } from "snapshot/world";
import { IntelMap, RoomIntel } from "./types";
import { StructureSnapshot } from "snapshot/types";

/**
 * Hostile structures an attack has to destroy: owned by someone else, not counting walls,
 * ramparts and keeper lairs (which can't be "cleared").
 */
export function isAttackableHostileStructure(s: StructureSnapshot): boolean {
    return s.owner === 'other'
        && s.structureType !== STRUCTURE_RAMPART
        && s.structureType !== STRUCTURE_KEEPER_LAIR
        && s.structureType !== STRUCTURE_POWER_BANK;
}

/** Visible rooms' intel is refreshed at most this often, to keep CPU down. */
export const INTEL_UPDATE_INTERVAL = 25;

/** Visible rooms whose intel is missing or older than the update interval. */
export function roomsNeedingIntel(world: WorldSnapshot, intel: IntelMap): RoomName[] {
    return world.visibleRooms.filter(room => !intel[room] || world.tick - intel[room].lastSeen >= INTEL_UPDATE_INTERVAL);
}

/** Builds a room's intel entry from what's visible now, keeping when hostiles were last seen. */
export function recordIntel(room: RoomSnapshot, previous: RoomIntel | undefined): RoomIntel {
    const combat = room.hostileCreeps.filter(h => (h.activeParts[ATTACK] ?? 0) + (h.activeParts[RANGED_ATTACK] ?? 0) > 0);
    const controller = room.controller;
    return {
        lastSeen: room.tick,
        sources: room.sources.map(s => ({ id: s.id, x: s.pos.x, y: s.pos.y })),
        controller: controller ? {
            x: controller.pos.x,
            y: controller.pos.y,
            level: controller.level,
            owner: controller.owner,
            reservedBy: controller.reservation?.username,
            reservationEnd: controller.reservation ? room.tick + controller.reservation.ticksToEnd : undefined,
        } : undefined,
        keeperLairs: room.structures.filter(s => s.structureType === STRUCTURE_KEEPER_LAIR).length,
        invaderCores: room.structures.filter(s => s.structureType === STRUCTURE_INVADER_CORE).length,
        hostileStructures: room.structures.filter(isAttackableHostileStructure).length,
        hostileOwners: [...new Set(combat.map(h => h.owner))],
        hostileCombatCreeps: combat.length,
        hostilesLastSeen: combat.length > 0 ? room.tick : previous?.hostilesLastSeen,
    };
}
