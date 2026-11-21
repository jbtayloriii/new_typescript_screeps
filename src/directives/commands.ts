import { isValidRoomName } from "utils/room_names";
import { DirectiveStore } from "./store";
import { Directive, DirectiveType, isEnded } from "./types";

/**
 * Console commands, installed as the global `cmd` (see main.ts). Each returns a message for the
 * console. They only create or cancel directives; the empire planner and bases do the rest.
 *
 *   cmd.remoteMine('W1N2')                remote mine W1N2 from the closest base
 *   cmd.scout('W5N5', { base: 'W1N1' })   scout a room from a given base
 *   cmd.claim('W2N3', { x: 20, y: 25 })   claim a room, with the first spawn at (20, 25)
 *   cmd.list() / cmd.list(true)           active directives / including finished ones
 *   cmd.cancel('d3')                      cancel a directive
 */
export interface Commands {
    help(): string;
    list(includeEnded?: boolean): string;
    cancel(id: string): string;
    remoteMine(room: RoomName, opts?: { base?: RoomName }): string;
    scout(room: RoomName, opts?: { base?: RoomName }): string;
    claim(room: RoomName, opts?: { base?: RoomName, x?: number, y?: number }): string;
}

export const HELP = `Directives (empire-level goals):
  cmd.remoteMine(room, { base? })      remote mine a room (overrides the automatic choice)
  cmd.scout(room, { base? })           send a scout to a room once
  cmd.claim(room, { base?, x?, y? })   claim a room; x/y place its first spawn
  cmd.list(includeEnded?)              list directives
  cmd.cancel(id)                       cancel a directive
Flags: yellow = remote mine, white = scout, purple = claim (spawn on the flag). Remove the flag to cancel.`;

export function formatDirective(d: Directive): string {
    const parts = [`${d.id} ${d.type} ${d.targetRoom}`, `[${d.status}]`];
    if (d.baseRoomName) parts.push(`from ${d.baseRoomName}`);
    parts.push(`(${d.source}${d.flagName ? ` flag ${d.flagName}` : ''})`);
    if (d.reason) parts.push(`- ${d.reason}`);
    return parts.join(' ');
}

export function createCommands(getMemory: () => Memory, getTick: () => number): Commands {
    const store = () => new DirectiveStore(getMemory());

    function addDirective(type: DirectiveType, room: RoomName, base?: RoomName, spawnPos?: { x: number, y: number }): string {
        if (!isValidRoomName(room)) {
            return `Invalid room name: ${room}`;
        }
        if (base !== undefined && !getMemory().bases_v3[base]) {
            return `Not a base: ${base}`;
        }
        const existing = store().all().find(d => d.type === type && d.targetRoom === room && !isEnded(d));
        if (existing) {
            return `Already exists: ${formatDirective(existing)}`;
        }
        const created = store().add({ type, targetRoom: room, source: 'manual', baseRoomName: base, spawnPos }, getTick());
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
    };
}
