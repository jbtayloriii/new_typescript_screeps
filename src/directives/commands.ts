import { isValidRoomName } from "utils/room_names";
import { DirectiveStore } from "./store";
import { Directive, DirectiveType, isEnded, isMilitary } from "./types";
import { MAX_SQUAD_SIZE } from "military/squads";
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
    claim(room: RoomName, opts?: { base?: RoomName, x?: number, y?: number }): string;
    attack(room: RoomName, opts?: { base?: RoomName, size?: number }): string;
    defend(room: RoomName, opts?: { base?: RoomName, size?: number }): string;
    escort(directiveId: string, opts?: { size?: number }): string;
    layout(room: RoomName, mode?: 'off'): string;
}

export const HELP = `Directives (empire-level goals):
  cmd.remoteMine(room, { base? })      remote mine a room (overrides the automatic choice)
  cmd.scout(room, { base? })           send a scout to a room once
  cmd.claim(room, { base?, x?, y? })   claim a room; x/y place its first spawn
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
    if (d.size !== undefined) parts.push(`size ${d.size}`);
    if (d.escortedId) parts.push(`escorting ${d.escortedId}`);
    if (d.reason) parts.push(`- ${d.reason}`);
    return parts.join(' ');
}

/**
 * `getBuilt` returns "x_y_structureType" for every structure and construction site in a room, or
 * undefined without vision. It's only used for `cmd.layout`'s built/planned counts.
 */
export function createCommands(
    getMemory: () => Memory,
    getTick: () => number,
    getBuilt: (room: RoomName) => ReadonlySet<string> | undefined = () => undefined): Commands {
    const store = () => new DirectiveStore(getMemory());

    function addDirective(
        type: DirectiveType,
        room: RoomName,
        base?: RoomName,
        spawnPos?: { x: number, y: number },
        extra: { size?: number, escortedId?: string } = {}): string {
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
            return addDirective('claim', room, opts.base, hasPos ? { x: opts.x!, y: opts.y! } : undefined);
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
