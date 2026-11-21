import { CreateConstructionSiteIntent } from "intents/types";
import { getLayoutCoordsBetweenLevels } from "pathfinding/base_layout_map_obj";
import { RoomSnapshot } from "snapshot/types";
import { basePlanCoordToBuildingObj } from "utils/string_utils";

/** How often (in ticks) unbuilt layout structures are placed as construction sites. */
export const LAYOUT_REPLAN_INTERVAL = 25;

/**
 * At most this many construction sites per room, so energy goes into finishing a few sites
 * rather than spreading across many. Also keeps well under the game's 100-site limit.
 */
export const MAX_SITES_PER_ROOM = 5;

/** The controller container is placed from this RCL (when containers unlock). */
export const CONTROLLER_CONTAINER_RCL = 2;

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

function priorityOf(structure: BuildableStructureConstant): number {
    const index = BUILD_PRIORITY.indexOf(structure);
    return index < 0 ? BUILD_PRIORITY.length : index;
}

export interface ConstructionPlan {
    readonly intents: CreateConstructionSiteIntent[];
    /** Changes to save to the base's memory. */
    readonly memoryUpdate: Partial<BaseMemory>;
}

/**
 * Every LAYOUT_REPLAN_INTERVAL ticks, and right after a controller level-up, places construction
 * sites for unbuilt structures from every unlocked layout level (plus the controller container),
 * in BUILD_PRIORITY order, up to MAX_SITES_PER_ROOM sites at a time. Re-applying all levels
 * retries failed sites and rebuilds destroyed structures. Spots that already have the structure
 * or a site are skipped.
 */
export function planConstruction(home: RoomSnapshot, base: Readonly<BaseMemory>): ConstructionPlan {
    const level = home.controller?.level ?? 0;
    const leveledUp = level > base.currentControllerLevelPlan;
    if (!leveledUp && home.tick - base.lastBaseLayoutPlanTick < LAYOUT_REPLAN_INTERVAL) {
        return { intents: [], memoryUpdate: {} };
    }
    const memoryUpdate = { currentControllerLevelPlan: level, lastBaseLayoutPlanTick: home.tick };

    const slots = MAX_SITES_PER_ROOM - home.constructionSites.length;
    if (slots <= 0) {
        return { intents: [], memoryUpdate };
    }

    const occupied = new Set<string>([
        ...home.structures.map(s => `${s.pos.x}_${s.pos.y}_${s.structureType}`),
        ...home.constructionSites.map(s => `${s.pos.x}_${s.pos.y}_${s.structureType}`),
    ]);

    const planned = getLayoutCoordsBetweenLevels(base.baseLayout, 0, level).map(basePlanCoordToBuildingObj);
    if (base.controllerContainer && level >= CONTROLLER_CONTAINER_RCL) {
        planned.push({ coord: base.controllerContainer, structure: STRUCTURE_CONTAINER });
    }

    const intents = planned
        .filter(({ coord, structure }) => !occupied.has(`${coord.x}_${coord.y}_${structure}`))
        .sort((a, b) => priorityOf(a.structure) - priorityOf(b.structure))
        .slice(0, slots)
        .map(({ coord, structure }): CreateConstructionSiteIntent => ({
            kind: 'createConstructionSite',
            pos: { x: coord.x, y: coord.y, roomName: home.name },
            structureType: structure,
        }));
    return { intents, memoryUpdate };
}
