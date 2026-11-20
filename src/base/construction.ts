import { CreateConstructionSiteIntent } from "intents/types";
import { getLayoutCoordsBetweenLevels } from "pathfinding/base_layout_map_obj";
import { RoomSnapshot } from "snapshot/types";
import { basePlanCoordToBuildingObj } from "utils/string_utils";

/** How often (in ticks) the base layout is re-applied as construction sites. */
export const LAYOUT_REPLAN_INTERVAL = 100;

export interface ConstructionPlan {
    readonly intents: CreateConstructionSiteIntent[];
    /** Changes to save to the base's memory. */
    readonly memoryUpdate: Partial<BaseMemory>;
}

/**
 * Every LAYOUT_REPLAN_INTERVAL ticks, and right after a controller level-up, places construction
 * sites for every unlocked layout level. Re-applying all levels retries sites that failed before
 * and rebuilds destroyed structures. Spots that already have the structure or a site are skipped.
 */
export function planConstruction(home: RoomSnapshot, base: Readonly<BaseMemory>): ConstructionPlan {
    const level = home.controller?.level ?? 0;
    const leveledUp = level > base.currentControllerLevelPlan;
    if (!leveledUp && home.tick - base.lastBaseLayoutPlanTick < LAYOUT_REPLAN_INTERVAL) {
        return { intents: [], memoryUpdate: {} };
    }

    const occupied = new Set<string>([
        ...home.structures.map(s => `${s.pos.x}_${s.pos.y}_${s.structureType}`),
        ...home.constructionSites.map(s => `${s.pos.x}_${s.pos.y}_${s.structureType}`),
    ]);

    const intents: CreateConstructionSiteIntent[] = [];
    for (const coordString of getLayoutCoordsBetweenLevels(base.baseLayout, 0, level)) {
        const { coord, structure } = basePlanCoordToBuildingObj(coordString);
        if (occupied.has(`${coord.x}_${coord.y}_${structure}`)) {
            continue;
        }
        intents.push({
            kind: 'createConstructionSite',
            pos: { x: coord.x, y: coord.y, roomName: home.name },
            structureType: structure,
        });
    }
    return {
        intents,
        memoryUpdate: { currentControllerLevelPlan: level, lastBaseLayoutPlanTick: home.tick },
    };
}
