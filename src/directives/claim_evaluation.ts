import { IntelMap, RoomIntel } from "intel/types";
import { WorldSnapshot } from "snapshot/world";

/**
 * Checks before claiming a room (docs/EXPANSION.md, "Checks before committing"). Pure.
 *
 * Room checks, after scouting: hard blockers cancel the claim, soft ones hold it.
 * Base readiness, before the claimer is sent: anything short holds the claim, unless `force`.
 */

/** Player creeps seen in the target room this recently hold the claim. */
export const PLAYER_HOSTILE_RECENT_TICKS = 1500;

/** Base readiness thresholds: full-size pioneers (WCM×5 = 1000) and a fast claimer (850). */
export const CLAIM_MIN_RCL = 4;
export const CLAIM_MIN_BASE_CAPACITY = 1300;
/** The claim costs about 6–7k energy of creeps, and the parent base mustn't starve. */
export const CLAIM_MIN_STORAGE = 10000;
/** CLAIM creeps live 600 ticks, so the route has to be shorter than this. */
export const CLAIM_MAX_ROUTE_TICKS = 500;
/** Rough ticks to cross one room. */
export const TICKS_PER_ROOM = 50;

const INVADER = 'Invader';

export interface RoomCheckInput {
    readonly intel: RoomIntel;
    readonly myUsername: string | undefined;
    readonly tick: number;
    /** `Game.map.getRoomStatus` of the target room and of the base. */
    readonly targetStatus: string;
    readonly baseStatus: string;
    /** Rooms from the base to the target, avoiding other players' rooms; null if there's no such route. */
    readonly route: readonly RoomName[] | null;
}

/** Hard blockers cancel; soft ones hold (the claim waits, with the reason shown in `cmd.list`). */
export type CheckResult = { readonly cancel: string } | { readonly hold: string } | null;

/** The room checks after scouting. */
export function checkClaimRoom(input: RoomCheckInput): CheckResult {
    const { intel } = input;
    if (!intel.controller) {
        return { cancel: 'room has no controller' };
    }
    const owner = intel.controller.owner;
    if (owner && owner !== input.myUsername) {
        return { cancel: `owned by ${owner}` };
    }
    if (input.targetStatus !== input.baseStatus) {
        return { cancel: `room is ${input.targetStatus} and the base is ${input.baseStatus}` };
    }
    if (input.route === null) {
        return { cancel: 'no route that avoids other players\' rooms' };
    }
    const players = (intel.hostileOwners ?? []).filter(o => o !== INVADER);
    const recent = intel.hostilesLastSeen !== undefined && input.tick - intel.hostilesLastSeen < PLAYER_HOSTILE_RECENT_TICKS;
    const playerStructures = (intel.hostileStructures ?? 0) - (intel.invaderCores ?? 0);
    if ((players.length > 0 && recent) || playerStructures > 0) {
        return { hold: `player hostiles${players.length > 0 ? ` (${players.join(', ')})` : ''} in the room, use cmd.escort` };
    }
    return null;
}

/** What base readiness needs to know about the claim's base. */
export interface ClaimBaseState {
    readonly roomName: RoomName;
    readonly rcl: number;
    readonly energyCapacity: number;
    readonly storageEnergy: number;
    /** Player attackers in the base room right now. */
    readonly underAttack: boolean;
    /** Another claim from this base is claiming or building. */
    readonly otherClaim?: string;
    /** Rooms along the route to the target. */
    readonly routeRooms: number;
}

/** Why the base isn't ready to send a claimer, or null if it is. */
export function claimBaseNotReady(base: ClaimBaseState): string | null {
    if (base.rcl < CLAIM_MIN_RCL) {
        return `base RCL ${base.rcl} < ${CLAIM_MIN_RCL}`;
    }
    if (base.energyCapacity < CLAIM_MIN_BASE_CAPACITY) {
        return `base energy capacity ${base.energyCapacity} < ${CLAIM_MIN_BASE_CAPACITY}`;
    }
    if (base.storageEnergy < CLAIM_MIN_STORAGE) {
        return `base storage ${base.storageEnergy} < ${CLAIM_MIN_STORAGE} energy`;
    }
    if (base.underAttack) {
        return 'base is under attack';
    }
    if (base.otherClaim) {
        return `base is already running claim ${base.otherClaim}`;
    }
    const routeTicks = base.routeRooms * TICKS_PER_ROOM;
    if (routeTicks >= CLAIM_MAX_ROUTE_TICKS) {
        return `route is ~${routeTicks} ticks, too long for a claimer (${CLAIM_MAX_ROUTE_TICKS})`;
    }
    return null;
}

/** A claim room counts as threatened for this long after hostile combat creeps were last seen. */
export const CLAIM_THREAT_COOLDOWN = 300;

/**
 * Who threatens a claim room: hostile combat creeps (any owner but Source Keepers) there now, or
 * seen within CLAIM_THREAT_COOLDOWN, or an Invader core. Returns their owners ('Invader' for
 * NPCs), or an empty list if the room is safe. While threatened, the claim's creeps stay home.
 */
export function claimRoomThreats(world: WorldSnapshot, intel: IntelMap, room: RoomName): string[] {
    const live = world.getRoom(room);
    if (live) {
        const combat = live.hostileCreeps.filter(h => h.owner !== 'Source Keeper'
            && (h.activeParts[ATTACK] ?? 0) + (h.activeParts[RANGED_ATTACK] ?? 0) > 0);
        const owners = new Set(combat.map(h => h.owner));
        if (live.structures.some(s => s.structureType === STRUCTURE_INVADER_CORE)) owners.add(INVADER);
        if (owners.size > 0) return [...owners];
    }
    const known = intel[room];
    if (!known) return [];
    if (!live && (known.invaderCores ?? 0) > 0) return [INVADER];
    const recent = known.hostilesLastSeen !== undefined && world.tick - known.hostilesLastSeen < CLAIM_THREAT_COOLDOWN;
    return recent ? [...(known.hostileOwners ?? [])] : [];
}
