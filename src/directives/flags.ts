import { FlagSnapshot } from "snapshot/world";
import { DirectiveSpec, DirectiveType } from "./types";

/**
 * Flag convention: the primary color picks the directive type; the secondary color is ignored.
 * - Yellow: remote mine the flag's room.
 * - White: scout the flag's room.
 * - Purple: claim the flag's room, with the first spawn on the flag's tile.
 * Removing the flag cancels its directive; the flag is removed when its directive is done.
 * Other colors are left alone, so flags can still be used for anything else.
 */
export const FLAG_DIRECTIVE_TYPES: Partial<Record<ColorConstant, DirectiveType>> = {
    [COLOR_YELLOW]: 'remoteMine',
    [COLOR_WHITE]: 'scout',
    [COLOR_PURPLE]: 'claim',
};

/** The directive a flag asks for, or null if its color isn't a directive color. */
export function parseFlag(flag: FlagSnapshot): DirectiveSpec | null {
    const type = FLAG_DIRECTIVE_TYPES[flag.color];
    if (!type) {
        return null;
    }
    return {
        type,
        targetRoom: flag.pos.roomName,
        source: 'flag',
        flagName: flag.name,
        spawnPos: type === 'claim' ? { x: flag.pos.x, y: flag.pos.y } : undefined,
    };
}
