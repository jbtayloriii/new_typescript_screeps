import type { ClaimEvaluation } from "./spawn_position";

/**
 * A directive is a persistent, high-level goal for the empire: "remote-mine W1N2", "scout W5N5",
 * "claim W2N3". Directives come from the automatic planners, console commands (`cmd.*`) or flags,
 * and all go through the same path: directive → a task in the assigned base → intents.
 *
 * Saved in `Memory.directives[id]`.
 */

export type DirectiveType = 'remoteMine' | 'scout' | 'claim' | 'attack' | 'defend' | 'escort';

/** Directive types run by a combat squad (see `military/`). */
export type MilitaryDirectiveType = 'attack' | 'defend' | 'escort';

export function isMilitary(type: DirectiveType): type is MilitaryDirectiveType {
    return type === 'attack' || type === 'defend' || type === 'escort';
}

/** Where a directive came from. Flag directives are cancelled when their flag is removed. */
export type DirectiveSource = 'auto' | 'manual' | 'flag';

/**
 * - pending: waiting for a base to take it (or, for claims, for enough GCL).
 * - active: assigned to a base, which runs a task for it.
 * - done / cancelled: finished. Kept for a while so `cmd.list(true)` can show them, and so the
 *   automatic planner doesn't recreate a directive you cancelled.
 */
export type DirectiveStatus = 'pending' | 'active' | 'done' | 'cancelled';

export interface Directive {
    readonly id: string;
    readonly type: DirectiveType;
    readonly targetRoom: RoomName;
    readonly source: DirectiveSource;
    readonly status: DirectiveStatus;
    readonly createdAt: number;
    /** The base that runs this directive. Set by the caller, or by `planDirectives` when pending. */
    readonly baseRoomName?: RoomName;
    /** Why it's pending, done or cancelled, or why an automatic one was made (for `cmd.list`). */
    readonly reason?: string;
    /** Tick it became done or cancelled. */
    readonly endedAt?: number;
    /** The flag that created it, for flag directives. */
    readonly flagName?: string;
    /** Claims: where the first spawn goes. From the flag or command, else chosen from terrain. */
    readonly spawnPos?: { readonly x: number; readonly y: number };
    /** Military directives: how many creeps the squad has (see `squadComposition`). */
    readonly size?: number;
    /** Escorts: the directive whose creeps the squad guards. */
    readonly escortedId?: string;
    /** Defending a base's own room: the last tick player attackers were seen there. */
    readonly lastThreatAt?: number;
    /**
     * Defending a base's own room: the most of each combat part seen on the attackers at once
     * during this defense. The squad's make-up counters it (see `military/home_defense.ts`).
     */
    readonly threat?: ThreatParts;

    // Claims (see docs/EXPANSION.md and directives/claim_phases.ts):
    /** Where the claim is: scouting → evaluating → claiming → building → incubating. Missing means scouting. */
    readonly phase?: ClaimPhase;
    /** The spawn position evaluation, made once in `evaluating`. */
    readonly evaluation?: ClaimEvaluation;
    /** Rooms from the base to the target (not including the base), avoiding other players' rooms. */
    readonly route?: readonly RoomName[];
    /** Claimers sent so far, and the latest one's name (to count new ones). */
    readonly claimAttempts?: number;
    readonly lastClaimer?: string;
    /** Tick the controller was claimed. */
    readonly claimedAt?: number;
    /** Skip the base readiness checks (never the room's hard blockers). */
    readonly force?: boolean;
    /** Ticks a pioneer took to reach the room, measured from the first one to arrive. */
    readonly pioneerTravelTicks?: number;
    /** The spawn site's progress (of 15,000), and the tick it last went up. */
    readonly spawnProgress?: number;
    readonly spawnProgressAt?: number;
    /** Tick the claim was reported stalled (cleared when progress resumes). */
    readonly stalledAt?: number;
}

export type ClaimPhase = 'scouting' | 'evaluating' | 'claiming' | 'building' | 'incubating';

/** Combat body parts on a group of hostile creeps. */
export interface ThreatParts {
    readonly attack: number;
    readonly ranged: number;
    readonly work: number;
    readonly heal: number;
}

/** What's needed to create a directive; the rest is filled in when it is saved. */
export type DirectiveSpec = Pick<Directive, 'type' | 'targetRoom' | 'source'>
    & Partial<Pick<Directive, 'baseRoomName' | 'flagName' | 'spawnPos' | 'size' | 'escortedId' | 'lastThreatAt' | 'reason' | 'threat' | 'force'>>;

export type DirectiveMap = { readonly [id: string]: Directive };

export function isEnded(directive: Directive): boolean {
    return directive.status === 'done' || directive.status === 'cancelled';
}
