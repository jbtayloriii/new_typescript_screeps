import { CreateConstructionSiteIntent } from "intents/types";
import { getLayoutCoordsBetweenLevels } from "pathfinding/base_layout_map_obj";
import { RoomSnapshot } from "snapshot/types";
import { basePlanCoordToBuildingObj } from "utils/string_utils";

/** How often (in ticks) unbuilt layout structures are placed as construction sites. */
export const LAYOUT_REPLAN_INTERVAL = 25;

/**
 * At most this many construction sites per room for each structure type and everything more
 * important than it (see `planConstruction`), so energy goes into finishing a few sites rather
 * than spreading across many. Also keeps well under the game's 100-site limit.
 */
export const MAX_SITES_PER_ROOM = 5;

/**
 * Roads are placed from this RCL. Before it, energy is better spent reaching the next RCL and on
 * extensions than on roads (which also need upkeep).
 */
export const ROAD_MIN_RCL = 3;

/**
 * Structure types planned but not built until code uses them, so a base doesn't spend energy
 * (100k each for the terminal, factory and nuker) on structures nothing runs. Remove a type as
 * its logic lands. Already-built ones are left alone.
 */
export const NOT_YET_BUILT: ReadonlySet<BuildableStructureConstant> = new Set([
    STRUCTURE_LINK,        // until a link task moves energy
    STRUCTURE_EXTRACTOR,   // until mineral mining
    STRUCTURE_LAB,         // until reactions or boosts
    STRUCTURE_TERMINAL,    // until terminal/market code
    STRUCTURE_FACTORY,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_NUKER,
    STRUCTURE_OBSERVER,
]);

/** Build order: earlier structure types are placed first. Unlisted types go last. */
export const BUILD_PRIORITY: readonly BuildableStructureConstant[] = [
    STRUCTURE_SPAWN,
    STRUCTURE_EXTENSION,
    STRUCTURE_TOWER,
    STRUCTURE_CONTAINER,
    STRUCTURE_STORAGE,
    STRUCTURE_LINK,
    STRUCTURE_TERMINAL,
    STRUCTURE_EXTRACTOR,
    STRUCTURE_LAB,
    STRUCTURE_FACTORY,
    STRUCTURE_OBSERVER,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_NUKER,
    STRUCTURE_ROAD,
    STRUCTURE_WALL,
    STRUCTURE_RAMPART,
];

/** A structure type's place in BUILD_PRIORITY (lower is more important). */
export function priorityOf(structure: StructureConstant): number {
    const index = BUILD_PRIORITY.indexOf(structure as BuildableStructureConstant);
    return index < 0 ? BUILD_PRIORITY.length : index;
}

export interface ConstructionPlan {
    readonly intents: CreateConstructionSiteIntent[];
    /** Changes to save to the base's memory. */
    readonly memoryUpdate: Partial<BaseMemory>;
}

/**
 * Every LAYOUT_REPLAN_INTERVAL ticks, and right after a controller level-up, places construction
 * sites for unbuilt structures from every unlocked layout level, in BUILD_PRIORITY order, except
 * NOT_YET_BUILT types. Re-applying all levels retries failed sites and rebuilds destroyed
 * structures. Spots that already have the structure or a site are skipped.
 *
 * The site cap is per priority tier: a structure is placed only while fewer than
 * MAX_SITES_PER_ROOM sites exist for it and everything more important. So, for example, road
 * sites placed at RCL 1 never stop extensions being placed at RCL 2.
 */
export function planConstruction(home: RoomSnapshot, base: Readonly<BaseMemory>): ConstructionPlan {
    const level = home.controller?.level ?? 0;
    const leveledUp = level > base.currentControllerLevelPlan;
    if (!leveledUp && home.tick - base.lastBaseLayoutPlanTick < LAYOUT_REPLAN_INTERVAL) {
        return { intents: [], memoryUpdate: {} };
    }
    const memoryUpdate = { currentControllerLevelPlan: level, lastBaseLayoutPlanTick: home.tick };

    const occupied = new Set<string>([
        ...home.structures.map(s => `${s.pos.x}_${s.pos.y}_${s.structureType}`),
        ...home.constructionSites.map(s => `${s.pos.x}_${s.pos.y}_${s.structureType}`),
    ]);

    const planned = getLayoutCoordsBetweenLevels(base.baseLayout, 0, level).map(basePlanCoordToBuildingObj);

    const candidates = planned
        .filter(({ structure }) => !NOT_YET_BUILT.has(structure))
        .filter(({ coord, structure }) => !occupied.has(`${coord.x}_${coord.y}_${structure}`))
        .filter(({ structure }) => structure !== STRUCTURE_ROAD || level >= ROAD_MIN_RCL)
        .sort((a, b) => priorityOf(a.structure) - priorityOf(b.structure));

    // Priorities of all sites: existing ones, plus ones placed below as we go.
    const sitePriorities = home.constructionSites.map(s => priorityOf(s.structureType));
    const intents: CreateConstructionSiteIntent[] = [];
    for (const { coord, structure } of candidates) {
        const priority = priorityOf(structure);
        const asImportant = sitePriorities.filter(p => p <= priority).length;
        if (asImportant >= MAX_SITES_PER_ROOM) {
            continue;
        }
        sitePriorities.push(priority);
        intents.push({
            kind: 'createConstructionSite',
            pos: { x: coord.x, y: coord.y, roomName: home.name },
            structureType: structure,
        });
    }
    return { intents, memoryUpdate };
}
