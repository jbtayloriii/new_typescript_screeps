/**
 * A directive is a persistent, high-level goal for the empire: "remote-mine W1N2", "scout W5N5",
 * "claim W2N3". Directives come from the automatic planners, console commands (`cmd.*`) or flags,
 * and all go through the same path: directive → a task in the assigned base → intents.
 *
 * Saved in `Memory.directives[id]`.
 */

export type DirectiveType = 'remoteMine' | 'scout' | 'claim';

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
    /** Why it's pending, done or cancelled (for `cmd.list`). */
    readonly reason?: string;
    /** Tick it became done or cancelled. */
    readonly endedAt?: number;
    /** The flag that created it, for flag directives. */
    readonly flagName?: string;
    /** Claims: where the first spawn goes. From the flag or command, else chosen from terrain. */
    readonly spawnPos?: { readonly x: number; readonly y: number };
}

/** What's needed to create a directive; the rest is filled in when it is saved. */
export type DirectiveSpec = Pick<Directive, 'type' | 'targetRoom' | 'source'>
    & Partial<Pick<Directive, 'baseRoomName' | 'flagName' | 'spawnPos'>>;

export type DirectiveMap = { readonly [id: string]: Directive };

export function isEnded(directive: Directive): boolean {
    return directive.status === 'done' || directive.status === 'cancelled';
}
