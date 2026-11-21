import { Directive, DirectiveSpec, isEnded } from "./types";
import { DirectiveChanges } from "./planning";

/** Done directives are kept this long (for `cmd.list(true)`), cancelled ones longer (see below). */
export const DONE_DIRECTIVE_TTL = 5000;
/** Cancelled directives also stop the automatic planner recreating them, so they're kept longer. */
export const CANCELLED_DIRECTIVE_TTL = 50000;

/** Typed access to `Memory.directives`. Takes the Memory object so tests can pass a fake. */
export class DirectiveStore {
    constructor(private readonly memory: Memory) { }

    all(): Directive[] {
        return Object.values(this.memory.directives);
    }

    get(id: string): Directive | undefined {
        return this.memory.directives[id];
    }

    /** Saves a new directive: active right away if it already has a base, else pending. */
    add(spec: DirectiveSpec, tick: number): Directive {
        const directive: Directive = {
            ...spec,
            id: `d${this.memory.nextDirectiveId++}`,
            status: spec.baseRoomName ? 'active' : 'pending',
            createdAt: tick,
        };
        this.memory.directives[directive.id] = directive;
        return directive;
    }

    /** Merges changes into a directive. Keys set to undefined are removed. */
    update(id: string, patch: Partial<Directive>): void {
        const existing = this.memory.directives[id];
        if (!existing) {
            return;
        }
        const updated: Record<string, unknown> = { ...existing, ...patch };
        for (const key of Object.keys(updated)) {
            if (updated[key] === undefined) {
                delete updated[key];
            }
        }
        this.memory.directives[id] = updated as unknown as Directive;
    }

    end(id: string, status: 'done' | 'cancelled', reason: string, tick: number): void {
        this.update(id, { status, reason, endedAt: tick });
    }

    /** Saves the planner's changes: ends first, then updates, then new directives. */
    apply(changes: DirectiveChanges, tick: number): void {
        changes.end.forEach(e => this.end(e.id, e.status, e.reason, tick));
        changes.update.forEach(u => this.update(u.id, u.patch));
        changes.create.forEach(spec => this.add(spec, tick));
    }

    /** Deletes ended directives past their time to live. */
    prune(tick: number): void {
        for (const directive of this.all()) {
            if (!isEnded(directive) || directive.endedAt === undefined) {
                continue;
            }
            const ttl = directive.status === 'cancelled' ? CANCELLED_DIRECTIVE_TTL : DONE_DIRECTIVE_TTL;
            if (tick - directive.endedAt > ttl) {
                delete this.memory.directives[directive.id];
            }
        }
    }
}
