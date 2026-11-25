import { isValidRoomName, roomLinearDistance } from "utils/room_names";
import { DirectiveStore } from "./store";
import { Directive, DirectiveType, isEnded, isMilitary } from "./types";
import { MAX_SQUAD_SIZE } from "military/squads";
import { assessClaim, ClaimAssessment } from "./claim_phases";
import { DirectivePlanInput } from "./planning";
import { FULL_EXTENSION_STAMPS } from "./spawn_position";
import { summarizeLayout } from "visuals/layout_overlay";
import { VISUALS_DURATION } from "visuals/settings";

/**
 * Console commands, installed as the global `cmd` (see main.ts). Each returns a message for the
 * console. They only create or cancel directives; the empire planner and bases do the rest.
 *
 *   cmd.remoteMine('W1N2')                remote mine W1N2 from the closest base
 *   cmd.scout('W5N5', { base: 'W1N1' })   scout a room from a given base
 *   cmd.claim('W2N3', { x: 20, y: 25 })   claim a room, with the first spawn at (20, 25)
 *   cmd.list() / cmd.list(true)           active directives / including finished ones
 *   cmd.cancel('d3')                      cancel a directive
 *   cmd.layout('W1N1')                    print a base's planned layout and show it in the room
 */
export interface Commands {
    help(): string;
    list(includeEnded?: boolean): string;
    cancel(id: string): string;
    remoteMine(room: RoomName, opts?: { base?: RoomName }): string;
    scout(room: RoomName, opts?: { base?: RoomName }): string;
    claim(room: RoomName, opts?: { base?: RoomName, x?: number, y?: number, force?: boolean }): string;
    evaluate(room: RoomName, opts?: { base?: RoomName, x?: number, y?: number }): string;
    attack(room: RoomName, opts?: { base?: RoomName, size?: number }): string;
    defend(room: RoomName, opts?: { base?: RoomName, size?: number }): string;
    escort(directiveId: string, opts?: { size?: number }): string;
    layout(room: RoomName, mode?: 'off'): string;
}

export const HELP = `Directives (empire-level goals):
  cmd.remoteMine(room, { base? })      remote mine a room (overrides the automatic choice)
  cmd.scout(room, { base? })           send a scout to a room once
  cmd.claim(room, { base?, x?, y?, force? })  claim a room: scout, check, wait for the base to be
                                       ready (force skips that), claim, build the spawn; x/y place it
  cmd.evaluate(room, { base?, x?, y? })   dry run of a claim: spawn tile, distances, checks
  cmd.attack(room, { base?, size? })   send a squad to clear a room (default 4 creeps)
  cmd.defend(room, { base?, size? })   send a squad to keep a room clear (default 2)
  cmd.escort(id, { size? })            guard another directive's creeps (e.g. a claim)
  cmd.list(includeEnded?)              list directives
  cmd.cancel(id)                       cancel a directive
  cmd.layout(room, 'off'?)             print a base's layout and warnings; show it in the room
Flags: yellow = remote mine, white = scout, purple = claim (spawn on the flag). Remove the flag to cancel.

Visuals (HUD, switches off after 200 ticks):
  cmd.visuals()                        list rooms with visuals on
  cmd.visuals(room)                    toggle the default panels (header, tasks, spawn, economy)
  cmd.visuals(room, 'off' | 'all' | ['tasks', 'spawn'])`;

export function formatDirective(d: Directive): string {
    const parts = [`${d.id} ${d.type} ${d.targetRoom}`, `[${d.status}]`];
    if (d.baseRoomName) parts.push(`from ${d.baseRoomName}`);
    parts.push(`(${d.source}${d.flagName ? ` flag ${d.flagName}` : ''})`);
    if (d.phase && !isEnded(d)) parts.push(d.phase);
    if (d.type === 'claim' && d.spawnPos) {
        const built = d.spawnProgress !== undefined ? ` ${Math.floor(100 * d.spawnProgress / CONSTRUCTION_COST[STRUCTURE_SPAWN])}%` : '';
        parts.push(`spawn ${d.spawnPos.x},${d.spawnPos.y}${built}`);
    }
    if (d.force) parts.push('forced');
    if (d.size !== undefined) parts.push(`size ${d.size}`);
    if (d.escortedId) parts.push(`escorting ${d.escortedId}`);
    if (d.reason) parts.push(`- ${d.reason}`);
    return parts.join(' ');
}

/** A claim evaluation as console lines (see `cmd.evaluate`). */
export function formatClaimAssessment(room: RoomName, baseRoomName: RoomName, a: ClaimAssessment): string {
    if (a.noIntel) {
        return `No intel for ${room}: run cmd.scout('${room}') first (or cmd.claim, which scouts it).`;
    }
    const lines = [`${room} from ${baseRoomName}:`];
    if (a.cancel) {
        lines.push(`  can't claim: ${a.cancel}`);
        return lines.join('\n');
    }
    const e = a.evaluation!;
    lines.push(`  spawn ${e.spawnPos.x},${e.spawnPos.y} · sources ${e.sourceDistances.join(', ')} · controller ${e.controllerDistance} (walking)`);
    lines.push(`  extension stamps ${e.extensionStamps}/${FULL_EXTENSION_STAMPS} · route ${a.route!.length} room${a.route!.length === 1 ? '' : 's'}: ${a.route!.join(' → ')}`);
    lines.push(`  room: ${a.hold ? `hold (${a.hold})` : 'ok'} · base: ${a.notReady ? `not ready (${a.notReady})` : 'ready'}`);
    for (const w of e.warnings) lines.push(`  warning: ${w}`);
    return lines.join('\n');
}

/**
 * `getBuilt` returns "x_y_structureType" for every structure and construction site in a room, or
 * undefined without vision. It's only used for `cmd.layout`'s built/planned counts.
 * `getPlanInput` gives what the empire planner sees this tick, for `cmd.evaluate`.
 */
export function createCommands(
    getMemory: () => Memory,
    getTick: () => number,
    getBuilt: (room: RoomName) => ReadonlySet<string> | undefined = () => undefined,
    getPlanInput?: () => DirectivePlanInput): Commands {
    const store = () => new DirectiveStore(getMemory());

    function addDirective(
        type: DirectiveType,
        room: RoomName,
        base?: RoomName,
        spawnPos?: { x: number, y: number },
        extra: { size?: number, escortedId?: string, force?: boolean } = {}): string {
        if (!isValidRoomName(room)) {
            return `Invalid room name: ${room}`;
        }
        if (base !== undefined && !getMemory().bases_v3[base]) {
            return `Not a base: ${base}`;
        }
        if (extra.size !== undefined && (!Number.isInteger(extra.size) || extra.size < 1 || extra.size > MAX_SQUAD_SIZE)) {
            return `Size must be a whole number from 1 to ${MAX_SQUAD_SIZE}: ${extra.size}`;
        }
        const existing = store().all().find(d => d.type === type && d.targetRoom === room && !isEnded(d)
            && (type !== 'escort' || d.escortedId === extra.escortedId));
        if (existing) {
            return `Already exists: ${formatDirective(existing)}`;
        }
        const created = store().add({ type, targetRoom: room, source: 'manual', baseRoomName: base, spawnPos, ...extra }, getTick());
        return `Created ${formatDirective(created)}`;
    }

    return {
        help: () => HELP,

        list(includeEnded = false) {
            const shown = store().all().filter(d => includeEnded || !isEnded(d));
            return shown.length === 0 ? 'No directives.' : shown.map(formatDirective).join('\n');
        },

        cancel(id: string) {
            const directive = store().get(id);
            if (!directive) {
                return `No directive ${id}`;
            }
            if (isEnded(directive)) {
                return `Already ${directive.status}: ${formatDirective(directive)}`;
            }
            store().end(id, 'cancelled', 'cancelled from the console', getTick());
            return `Cancelled ${formatDirective(store().get(id)!)}`;
        },

        remoteMine: (room, opts = {}) => addDirective('remoteMine', room, opts.base),
        scout: (room, opts = {}) => addDirective('scout', room, opts.base),
        claim(room, opts = {}) {
            const hasPos = opts.x !== undefined && opts.y !== undefined;
            if (hasPos && (opts.x! < 1 || opts.x! > 48 || opts.y! < 1 || opts.y! > 48)) {
                return `Spawn position must be within 1-48: (${opts.x}, ${opts.y})`;
            }
            return addDirective('claim', room, opts.base, hasPos ? { x: opts.x!, y: opts.y! } : undefined,
                opts.force ? { force: true } : {});
        },

        evaluate(room, opts = {}) {
            if (!isValidRoomName(room)) {
                return `Invalid room name: ${room}`;
            }
            if (!getPlanInput) {
                return 'cmd.evaluate needs the game world.';
            }
            const input = getPlanInput();
            const base = opts.base !== undefined
                ? input.bases.find(b => b.roomName === opts.base)
                : [...input.bases].sort((a, b) => roomLinearDistance(a.roomName, room) - roomLinearDistance(b.roomName, room))[0];
            if (!base) {
                return opts.base !== undefined ? `Not a base: ${opts.base}` : 'No bases.';
            }
            const spawnPos = opts.x !== undefined && opts.y !== undefined ? { x: opts.x, y: opts.y } : undefined;
            const assessment = assessClaim(room, base, { world: input.world, intel: input.intel, directives: input.directives }, { spawnPos });
            return formatClaimAssessment(room, base.roomName, assessment);
        },

        layout(room, mode) {
            const memory = getMemory();
            const base = memory.bases_v3[room];
            if (!base) {
                return `Not a base: ${room}`;
            }
            memory.visuals ??= {};
            const current = memory.visuals[room];
            const isOn = current !== undefined && getTick() < current.until;
            const others = isOn ? current.panels.filter(p => p !== 'layout') : [];
            if (mode === 'off') {
                if (others.length > 0) {
                    memory.visuals[room] = { panels: others, until: current!.until };
                } else {
                    delete memory.visuals[room];
                }
                return `Layout overlay off in ${room}.`;
            }
            memory.visuals[room] = { panels: [...others, 'layout'], until: getTick() + VISUALS_DURATION };
            return `${summarizeLayout(room, base, getBuilt(room))}\nLayout overlay on in ${room} for ${VISUALS_DURATION} ticks (cmd.layout('${room}', 'off') to hide).`;
        },

        attack: (room, opts = {}) => addDirective('attack', room, opts.base, undefined, { size: opts.size }),
        defend: (room, opts = {}) => addDirective('defend', room, opts.base, undefined, { size: opts.size }),
        escort(directiveId, opts = {}) {
            const escorted = store().get(directiveId);
            if (!escorted) {
                return `No directive ${directiveId}`;
            }
            if (isEnded(escorted) || isMilitary(escorted.type)) {
                return `Can't escort ${formatDirective(escorted)}`;
            }
            // The escort's base is set from the escorted directive by the planner.
            return addDirective('escort', escorted.targetRoom, undefined, undefined, { size: opts.size, escortedId: directiveId });
        },
    };
}
