import { Coordinate } from "global_types";
import { IntelMap } from "intel/types";
import { WorldSnapshot } from "snapshot/world";
import { checkClaimRoom, claimBaseNotReady } from "./claim_evaluation";
import { ClaimEvaluation, evaluateSpawnPosition } from "./spawn_position";
import { ClaimPhase, Directive, isEnded } from "./types";

/**
 * A claim's phases (docs/EXPANSION.md, "Lifecycle"), run by `planDirectives` each tick:
 *
 * - scouting: the claim task sends a scout, unless intel is fresh (seen since the claim was made).
 * - evaluating: room checks (hard blockers cancel, soft ones hold), a route that avoids other
 *   players' rooms, and the spawn position evaluation (all saved on the directive), then base
 *   readiness (holds unless `force`).
 * - claiming: the claim task sends claimers along the route; after MAX_CLAIM_ATTEMPTS claimers
 *   die, the claim is cancelled.
 * - building: pioneers build the spawn; the claim is done when the base is created.
 *
 * A claim already past a phase (e.g. an old claim whose controller is mine) falls through to
 * where it is in one tick.
 */

/** Cancel a claim once this many claimers have died without claiming. */
export const MAX_CLAIM_ATTEMPTS = 3;

/** What `planDirectives` passes about a base. */
export interface ClaimBase {
    readonly roomName: RoomName;
    readonly rcl: number;
    readonly energyCapacity: number;
    readonly storageEnergy: number;
    readonly underAttack: boolean;
}

export interface ClaimContext {
    readonly world: WorldSnapshot;
    readonly intel: IntelMap;
    readonly directives: readonly Directive[];
}

/** Everything known about claiming a room from a base: shared by the planner and `cmd.evaluate`. */
export type ClaimAssessment =
    | { readonly noIntel: true }
    | {
        readonly noIntel?: false;
        readonly cancel?: string;
        readonly hold?: string;
        /** Why the base isn't ready (a hold unless forced). */
        readonly notReady?: string;
        readonly route?: readonly RoomName[];
        readonly evaluation?: ClaimEvaluation;
    };

/** True if a room's controller is mine (live if visible, else from intel). */
export function isClaimedByMe(targetRoom: RoomName, ctx: ClaimContext): boolean {
    const live = ctx.world.getRoom(targetRoom);
    if (live) {
        return live.controller?.my ?? false;
    }
    const owner = ctx.intel[targetRoom]?.controller?.owner;
    return owner !== undefined && owner === ctx.world.myUsername;
}

/**
 * Assesses claiming `targetRoom` from `base`. Saved results (`route`, `evaluation`) are reused,
 * so the spawn evaluation (the expensive part) runs once per claim.
 */
export function assessClaim(
    targetRoom: RoomName,
    base: ClaimBase,
    ctx: ClaimContext,
    opts: { spawnPos?: Coordinate, route?: readonly RoomName[], evaluation?: ClaimEvaluation, directiveId?: string } = {}): ClaimAssessment {
    const intel = ctx.intel[targetRoom];
    if (!intel) {
        return { noIntel: true };
    }
    const { world } = ctx;
    const theirs = (room: RoomName) => {
        const owner = ctx.intel[room]?.controller?.owner;
        return owner !== undefined && owner !== world.myUsername;
    };
    const route = opts.route ?? world.findRoute(base.roomName, targetRoom, theirs);
    const check = checkClaimRoom({
        intel,
        myUsername: world.myUsername,
        tick: world.tick,
        targetStatus: world.getRoomStatus(targetRoom),
        baseStatus: world.getRoomStatus(base.roomName),
        route,
    });
    if (check && 'cancel' in check) {
        return { cancel: check.cancel };
    }
    let evaluation = opts.evaluation;
    if (!evaluation) {
        const result = evaluateSpawnPosition({
            roomName: targetRoom,
            terrain: world.getTerrain(targetRoom),
            sources: intel.sources,
            controller: intel.controller ? { x: intel.controller.x, y: intel.controller.y } : undefined,
            spawnPos: opts.spawnPos,
        });
        if ('blocker' in result) {
            return { cancel: result.blocker };
        }
        evaluation = { ...result.evaluation, routeRooms: route!.length };
    }
    const otherClaim = ctx.directives.find(d => d.type === 'claim' && d.id !== opts.directiveId && !isEnded(d)
        && d.baseRoomName === base.roomName && (d.phase === 'claiming' || d.phase === 'building'));
    const notReady = claimBaseNotReady({ ...base, otherClaim: otherClaim?.id, routeRooms: route!.length });
    return {
        hold: check && 'hold' in check ? check.hold : undefined,
        notReady: notReady ?? undefined,
        route: route!,
        evaluation,
    };
}

export interface ClaimPhaseResult {
    readonly patch: Partial<Directive>;
    /** Set to cancel the claim, with this reason. */
    readonly cancel?: string;
}

/** Moves an active claim through its phases (see the module comment). */
export function planClaimPhase(d: Directive, base: ClaimBase, ctx: ClaimContext): ClaimPhaseResult {
    const patch: { -readonly [K in keyof Directive]?: Directive[K] } = {};
    const setReason = (reason: string | undefined) => {
        if (reason !== d.reason) patch.reason = reason;
    };
    const claimed = isClaimedByMe(d.targetRoom, ctx);
    const intel = ctx.intel[d.targetRoom];
    let phase: ClaimPhase = d.phase ?? 'scouting';

    for (let step = 0; step < 4; step++) {
        if (phase === 'scouting') {
            if (claimed || (intel && intel.lastSeen >= d.createdAt)) {
                phase = 'evaluating';
                continue;
            }
            setReason('scouting the room');
            break;
        }
        if (phase === 'evaluating') {
            const a = assessClaim(d.targetRoom, base, ctx, {
                spawnPos: d.spawnPos, route: d.route, evaluation: d.evaluation, directiveId: d.id,
            });
            if (a.noIntel) {
                phase = 'scouting';
                break;
            }
            if (a.cancel) {
                return { patch, cancel: a.cancel };
            }
            if (!d.route && a.route) patch.route = a.route;
            if (!d.evaluation && a.evaluation) patch.evaluation = a.evaluation;
            if (!d.spawnPos && a.evaluation) patch.spawnPos = a.evaluation.spawnPos;
            if (a.hold && !claimed) {
                setReason(a.hold);
                break;
            }
            if (a.notReady && !claimed && !d.force) {
                setReason(`waiting: ${a.notReady}`);
                break;
            }
            setReason(undefined);
            phase = claimed ? 'building' : 'claiming';
            continue;
        }
        if (phase === 'claiming') {
            if (claimed) {
                patch.claimedAt = ctx.world.tick;
                phase = 'building';
                continue;
            }
            const claimers = ctx.world.myCreeps.filter(c => c.memory.role === 'claimer' && c.memory.targetRoom === d.targetRoom);
            const fresh = claimers.find(c => c.name !== d.lastClaimer);
            const attempts = (d.claimAttempts ?? 0) + (fresh ? 1 : 0);
            if (fresh) {
                patch.claimAttempts = attempts;
                patch.lastClaimer = fresh.name;
            }
            if (claimers.length === 0 && attempts >= MAX_CLAIM_ATTEMPTS) {
                return { patch, cancel: `claimer died ${attempts} times` };
            }
            break;
        }
        break; // building: done when the base is created (see `finishedReason`).
    }
    if (phase !== d.phase) patch.phase = phase;
    return { patch };
}
