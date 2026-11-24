import { Coordinate } from "global_types";
import { BaseLayoutError, LAYOUT_VERSION, LayoutPlan, planBaseLayout } from "pathfinding/base_layout_utils";
import { coordinateStringToCoordinate } from "utils/string_utils";

/**
 * The game-API side of base layout planning: reads the room, runs the planner
 * (pathfinding/base_layout_utils.ts) and saves the result in BaseMemory.
 */

/** Plans a layout for a room, keeping what's already built there. */
export function planLayoutForRoom(room: Room, spawn: Coordinate, baseMemory?: Readonly<BaseMemory>): LayoutPlan {
    const terrain = room.getTerrain();
    return planBaseLayout({
        roomName: room.name,
        terrain: (x, y) => terrain.get(x, y),
        spawn,
        sources: room.find(FIND_SOURCES).map(s => ({ x: s.pos.x, y: s.pos.y })),
        controller: room.controller ? { x: room.controller.pos.x, y: room.controller.pos.y } : undefined,
        mineral: room.find(FIND_MINERALS).map(m => ({ x: m.pos.x, y: m.pos.y }))[0],
        existing: {
            layout: baseMemory?.baseLayout ?? {},
            built: room.find(FIND_STRUCTURES).map(s => ({ x: s.pos.x, y: s.pos.y, structure: s.structureType })),
            controllerContainer: baseMemory?.controllerContainer,
        },
    });
}

/** "x_y_structureType" for every structure and construction site in a room (see the layout overlay). */
export function builtStructureKeys(room: Room): Set<string> {
    return new Set([
        ...room.find(FIND_STRUCTURES).map(s => `${s.pos.x}_${s.pos.y}_${s.structureType}`),
        ...room.find(FIND_CONSTRUCTION_SITES).map(s => `${s.pos.x}_${s.pos.y}_${s.structureType}`),
    ]);
}

/** Whether a base's layout came from an older planner. */
export function needsReplan(baseMemory: Readonly<BaseMemory>): boolean {
    return (baseMemory.layoutVersion ?? 1) < LAYOUT_VERSION;
}

/** The last tick a base replanned, so replans are spread out: one base per tick. */
let lastReplanTick = -1;

/**
 * Replans wait until the CPU bucket has at least this much. A replan can take more than a
 * tick's CPU limit, and a tick that runs out of CPU doesn't save Memory, so with an empty bucket
 * it would time out and retry every tick.
 */
export const REPLAN_MIN_BUCKET = 1000;

/**
 * Replans a base whose layout is out of date, at most one base per tick and only with
 * REPLAN_MIN_BUCKET CPU in the bucket. Built structures stay where they are. If planning fails
 * for any reason, the old layout is kept (with a warning) and not retried until the next
 * version. Returns whether it replanned.
 */
export function replanIfOutdated(room: Room, baseMemory: BaseMemory, tick: number, bucket: number): boolean {
    if (!needsReplan(baseMemory) || lastReplanTick === tick || bucket < REPLAN_MIN_BUCKET) {
        return false;
    }
    lastReplanTick = tick;
    const spawn = coordinateStringToCoordinate(baseMemory.initialSpawn);
    try {
        const plan = planLayoutForRoom(room, spawn, baseMemory);
        baseMemory.baseLayout = plan.layout;
        baseMemory.layoutWarnings = plan.warnings;
        if (plan.controllerContainer) baseMemory.controllerContainer = plan.controllerContainer;
        // Place construction sites from the new layout right away.
        baseMemory.lastBaseLayoutPlanTick = 0;
        console.log(`[${room.name}] replanned layout v${baseMemory.layoutVersion ?? 1} -> v${LAYOUT_VERSION}`
            + (plan.warnings.length > 0 ? `; warnings: ${plan.warnings.join('; ')}` : ''));
    } catch (e) {
        // Any error, not just BaseLayoutError: an unexpected one would otherwise throw (and
        // replan) every tick.
        const message = e instanceof Error ? e.message : String(e);
        baseMemory.layoutWarnings = [`replan failed, kept the old layout: ${message}`];
        console.log(`[${room.name}] layout replan failed: ${e instanceof Error && !(e instanceof BaseLayoutError) ? e.stack : message}`);
    }
    baseMemory.layoutVersion = LAYOUT_VERSION;
    return true;
}
