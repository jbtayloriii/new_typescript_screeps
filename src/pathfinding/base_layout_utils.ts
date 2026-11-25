import { BaseLayoutMap, Coordinate } from "global_types";
import { basePlanCoordToBuildingObj, buildableStructureToChar } from "utils/string_utils";
import { BaseLayoutMapObj } from "./base_layout_map_obj";
import { checkLayout } from "./layout_checks";
import { getDiamondMapping, getSquareMapping, Position } from "./map_plot_utils";
import {
    assignStamps, describeAssignment, LAB_STAMP, mirroredLabStamp, SPAWN_STAMP, STAMP_BODY, STAMP_ROADS,
    StampAssignment, stampTiles, StampTile, TOWER_STAMP,
} from "./stamps";

/**
 * Base layout planner (docs/BASE_LAYOUT.md). `planLayoutFromTerrain` is pure (terrain in, layout
 * out: core, stamp grid, labs); `planBaseLayout` adds the PathFinder steps (roads to the sources,
 * controller and mineral), then links, then runs the layout checks.
 */

/**
 * Bump when the planner's output changes, so existing bases replan (see base/layout.ts).
 * 2: v2 layout (tower/spawn/lab stamps, links, mineral, controller road). 3: protective ramparts.
 */
export const LAYOUT_VERSION = 3;

/** Structures that get a rampart over them, so attackers can't hit them until it's gone. */
export const PROTECTED_STRUCTURES: ReadonlySet<BuildableStructureConstant> = new Set([
    STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_STORAGE,
]);

/**
 * Protective ramparts start at this RCL (or the structure's own RCL, if later): RCL 3 is when
 * the first tower lands, and a new rampart (1 hit) needs a tower to repair it before it decays.
 */
export const PROTECTIVE_RAMPART_RCL = 3;

const MAP_SIZE = 50;

// Edges around a center location, for forming a 3x3 square
const CENTER_RING_OFFSETS: Coordinate[] = [
    { x: -1, y: -1 },
    { x: -1, y: 1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
];

// Spaces to look for grid stamps around the center location
const CENTER_RING_TO_EXPANSION_OFFSETS: Coordinate[] = [
    { x: 3, y: 2 },
    { x: 2, y: 3 },
    { x: -3, y: 2 },
    { x: -2, y: 3 },
    { x: 3, y: -2 },
    { x: 2, y: -3 },
    { x: -3, y: -2 },
    { x: -2, y: -3 },
];

/**
 * The core ring's structures, in ring order, skipping the initial spawn. The ring is for hub
 * traffic, so the RCL 8 slot holds the power spawn (the nuker goes in the spawn stamp), unless a
 * nuker is already built there.
 */
function centerBuildings(nukerInRing: boolean): { level: number, building: BuildableStructureConstant }[] {
    return [
        { level: 2, building: STRUCTURE_ROAD },
        { level: 3, building: STRUCTURE_TOWER },
        { level: 4, building: STRUCTURE_STORAGE },
        { level: 5, building: STRUCTURE_LINK },
        { level: 6, building: STRUCTURE_TERMINAL },
        { level: 7, building: STRUCTURE_FACTORY },
        { level: 8, building: nukerInRing ? STRUCTURE_NUKER : STRUCTURE_POWER_SPAWN },
    ];
}

/** Grid slots wanted: 12 extension stamps, the tower stamp and the spawn stamp. */
export const GRID_SLOTS = 14;
/** Candidates the slot search looks at before giving up. */
const MAX_SLOT_CANDIDATES = 300;

/** Link targets beyond the core link get these RCLs, longest haul first. */
const LINK_TARGET_LEVELS = [5, 6, 7];

/** Roads, containers and the mineral's extractor are placed at these RCLs. */
const SOURCE_ROAD_LEVEL = 2;
const CONTROLLER_CONTAINER_LEVEL = 2;
const CONTROLLER_ROAD_LEVEL = 3;
const MINERAL_LEVEL = 6;

// Support a 3x3 square, plus roads. This is 5x5 total, or radius 3
const BASE_CENTER_RADIUS = 3;

/** A structure in the room, for replanning an existing base. */
export interface BuiltStructure {
    readonly x: number;
    readonly y: number;
    readonly structure: StructureConstant;
}

/** What's known about an existing base when it replans. */
export interface ExistingBase {
    /** The layout it was built from. */
    readonly layout: BaseLayoutMap;
    /** Every structure in the room (owned or not: roads, containers…). */
    readonly built: readonly BuiltStructure[];
    /** The saved controller container tile, kept as it is. */
    readonly controllerContainer?: Coordinate;
}

export interface LayoutInput {
    readonly roomName: RoomName;
    /** Terrain mask at a tile (0, TERRAIN_MASK_WALL or TERRAIN_MASK_SWAMP), like `Room.Terrain.get`. */
    readonly terrain: (x: number, y: number) => number;
    /** The base's first spawn. */
    readonly spawn: Coordinate;
    readonly sources: readonly Coordinate[];
    readonly controller?: Coordinate;
    readonly mineral?: Coordinate;
    readonly existing?: ExistingBase;
}

export interface LayoutPlan {
    readonly layout: BaseLayoutMap;
    /** Shortfalls and failed checks, e.g. "only 13 grid slots fit". */
    readonly warnings: string[];
    readonly controllerContainer?: Coordinate;
}

/** The pure part of a plan, which the PathFinder steps add to. */
export interface TerrainPlan {
    readonly map: BaseLayoutMapObj;
    readonly center: Coordinate;
    readonly storage: Coordinate;
    /** Grid slot centers, in search order. */
    readonly slots: readonly Coordinate[];
    readonly assignments: readonly StampAssignment[];
    readonly warnings: string[];
    /** Tiles kept free for structures the PathFinder steps place (existing containers). */
    readonly reserved: ReadonlySet<string>;
    /** Roads already built in the room (walkable and cheap, but not planned). */
    readonly builtRoads: ReadonlySet<string>;
    /** Tiles with any structure built on them. */
    readonly builtTiles: ReadonlyMap<string, StructureConstant[]>;
}

export class BaseLayoutError extends Error { }

/**
 * Built structures that aren't blocked as "not planned" when replanning: the steps after the
 * grid (labs, extractor, links) find and keep them, ramparts share tiles, and the controller is
 * not a layout structure.
 */
const PLANNED_AFTER_BLOCKING: ReadonlySet<StructureConstant> = new Set([
    STRUCTURE_RAMPART, STRUCTURE_EXTRACTOR, STRUCTURE_LINK, STRUCTURE_LAB, STRUCTURE_CONTROLLER,
]);

const key = (c: Coordinate) => `${c.x}_${c.y}`;
const range = (a: Coordinate, b: Coordinate) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const manhattan = (a: Coordinate, b: Coordinate) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Plans a base's full layout (needs PathFinder). @throws {BaseLayoutError} if there's no room for a core. */
export function planBaseLayout(input: LayoutInput): LayoutPlan {
    const plan = planLayoutFromTerrain(input);
    const { map, warnings } = plan;
    const isWall = (x: number, y: number) => input.terrain(x, y) === TERRAIN_MASK_WALL;
    const builtOfType = (c: Coordinate, type: StructureConstant) => (plan.builtTiles.get(key(c)) ?? []).includes(type);

    const search = (goal: Coordinate, goalRange: number) => roadPath(input, plan, goal, goalRange);

    // Sources: a road from the spawn, with a container on the last tile (the miner's tile).
    const linkTargets: { tile: Coordinate, distance: number, near: Coordinate | null }[] = [];
    for (const source of input.sources) {
        const existing = neighbors(source).find(n => builtOfType(n, STRUCTURE_CONTAINER));
        const path = existing ? search(existing, 0) : search(source, 1);
        if (path === null) {
            warnings.push(`no road to the source at ${source.x},${source.y}`);
            continue;
        }
        // The path can end on a road another stamp planned next to the source. Then the
        // container goes on a free tile next to both the source and the path's end.
        let containerTile = path[path.length - 1];
        if (!map.isOpenOrType(containerTile, STRUCTURE_CONTAINER)) {
            const end = containerTile;
            const fallback = closest(neighbors(source).filter(n => range(n, end) <= 1 && isFree(n, input, plan)), end);
            if (fallback) {
                path.push(fallback);
                containerTile = fallback;
            }
        }
        path.slice(0, -1).forEach(tile => addIfOpen(map, SOURCE_ROAD_LEVEL, tile, STRUCTURE_ROAD));
        addIfOpen(map, SOURCE_ROAD_LEVEL, containerTile, STRUCTURE_CONTAINER);
        if (!map.isType(containerTile, STRUCTURE_CONTAINER)) {
            warnings.push(`no container for the source at ${source.x},${source.y}: ${containerTile.x},${containerTile.y} is taken`);
        }
        linkTargets.push({ tile: containerTile, distance: path.length, near: null });
    }

    // Controller: a container upgraders draw from, and a road to it from RCL 3.
    let controllerContainer: Coordinate | undefined;
    if (input.controller) {
        controllerContainer = input.existing?.controllerContainer
            ?? chooseControllerContainerTile(input.controller, input.spawn, isWall, plannedOrBlocked(map, plan));
        if (controllerContainer) {
            const path = search(controllerContainer, 0);
            if (path === null) {
                warnings.push(`no road to the controller container at ${controllerContainer.x},${controllerContainer.y}`);
            } else {
                path.slice(0, -1).forEach(tile => addIfOpen(map, CONTROLLER_ROAD_LEVEL, tile, STRUCTURE_ROAD));
                linkTargets.push({ tile: controllerContainer, distance: path.length, near: input.controller });
            }
            addIfOpen(map, CONTROLLER_CONTAINER_LEVEL, controllerContainer, STRUCTURE_CONTAINER);
        } else {
            warnings.push('no tile for the controller container');
        }
    }

    // Mineral: extractor, a container on the walkable neighbor closest to the core, and a road.
    if (input.mineral) {
        addIfOpen(map, MINERAL_LEVEL, input.mineral, STRUCTURE_EXTRACTOR);
        const container = neighbors(input.mineral).find(n => builtOfType(n, STRUCTURE_CONTAINER))
            ?? closest(neighbors(input.mineral).filter(n => isFree(n, input, plan)), plan.center);
        if (!container) {
            warnings.push('no tile for the mineral container');
        } else {
            const path = search(container, 0);
            if (path === null) {
                warnings.push('no road to the mineral');
            } else {
                path.slice(0, -1).forEach(tile => addIfOpen(map, MINERAL_LEVEL, tile, STRUCTURE_ROAD));
            }
            addIfOpen(map, MINERAL_LEVEL, container, STRUCTURE_CONTAINER);
        }
    }

    // Links: one next to each source container and the controller container, longest haul first.
    linkTargets.sort((a, b) => b.distance - a.distance);
    linkTargets.forEach((target, i) => {
        const options = neighbors(target.tile)
            .filter(n => target.near === null || range(n, target.near) <= 3);
        const tile = options.find(n => builtOfType(n, STRUCTURE_LINK))
            ?? closest(options.filter(n => isFree(n, input, plan)), input.spawn);
        if (!tile || !map.isOpenOrType(tile, STRUCTURE_LINK)) {
            warnings.push(`no tile for a link next to ${target.tile.x},${target.tile.y}`);
            return;
        }
        map.addBuilding(LINK_TARGET_LEVELS[i] ?? 8, tile, STRUCTURE_LINK);
    });

    const layout = map.toSerializedMap();
    const obstacles = [...input.sources, ...(input.controller ? [input.controller] : [])];
    warnings.push(...checkLayout({ layout, isWall, obstacles, core: plan.center }));
    warnings.push(...movedStructures(input.existing, layout));
    return { layout, warnings, controllerContainer };
}

/**
 * The pure steps: core, stamp grid (with built slots kept for existing bases) and labs.
 * @throws {BaseLayoutError} if there's no room for a core.
 */
export function planLayoutFromTerrain(input: LayoutInput): TerrainPlan {
    const builtTiles = new Map<string, StructureConstant[]>();
    for (const b of input.existing?.built ?? []) {
        builtTiles.set(key(b), [...(builtTiles.get(key(b)) ?? []), b.structure]);
    }
    const { map, center, storage, diamondDistances, nukerInRing } = planCore(input, builtTiles);
    const warnings: string[] = [];

    // Stamp grid: built slots keep what they have, the rest follow STAMP_ORDER.
    const slots = findStampSlots(center, diamondDistances, map, GRID_SLOTS);
    const previous = previousLayoutTiles(input.existing?.layout);
    const fixed = new Map<number, StampAssignment>();
    slots.forEach((slot, i) => {
        const hasBuilt = STAMP_BODY.some(({ dx, dy }) =>
            (builtTiles.get(key({ x: slot.x + dx, y: slot.y + dy })) ?? []).some(s => s !== STRUCTURE_ROAD));
        const kept = hasBuilt ? previousAssignment(slot, previous) : undefined;
        if (kept) fixed.set(i, kept);
    });
    const { assignments, dropped } = assignStamps(slots.length, fixed);
    assignments.forEach((assignment, i) => {
        for (const tile of stampTiles(assignment, { powerSpawnInSpawnStamp: nukerInRing })) {
            map.addBuilding(tile.level, { x: slots[i].x + tile.dx, y: slots[i].y + tile.dy }, tile.structure);
        }
    });
    if (dropped.length > 0) {
        warnings.push(`only ${slots.length} grid slots fit; dropped ${dropped.map(describeAssignment).join(', ')}`);
    }

    // Existing containers, links and labs stay where they are: they're reserved, so roads and
    // other placements avoid them, and the later steps plan them again. Other structures the
    // layout doesn't plan block their tiles.
    const reserved = new Set<string>();
    const builtRoads = new Set<string>();
    for (const b of input.existing?.built ?? []) {
        if (b.structure === STRUCTURE_ROAD) {
            builtRoads.add(key(b));
        } else if (b.structure === STRUCTURE_CONTAINER || b.structure === STRUCTURE_LINK || b.structure === STRUCTURE_LAB) {
            reserved.add(key(b));
        } else if (!PLANNED_AFTER_BLOCKING.has(b.structure)) {
            map.block(b);
        }
    }
    if (input.existing?.controllerContainer) {
        reserved.add(key(input.existing.controllerContainer));
    }
    for (const source of input.sources) map.block(source);
    if (input.controller) map.block(input.controller);

    const plan: TerrainPlan = { map, center, storage, slots, assignments, warnings, reserved, builtRoads, builtTiles };
    placeLabs(input, plan);
    addProtectiveRamparts(map);
    return plan;
}

/**
 * The first step: distance maps and the core (ring road, hub ring and center rampart). If a nuker
 * is already built in the ring's RCL 8 slot, it stays there.
 * @throws {BaseLayoutError} if there's no room for a core next to the spawn.
 */
export function planCore(input: LayoutInput, builtTiles: ReadonlyMap<string, StructureConstant[]> = new Map()) {
    const walls: Position[] = [];
    for (let x = 0; x < MAP_SIZE; x++) {
        for (let y = 0; y < MAP_SIZE; y++) {
            if (input.terrain(x, y) === TERRAIN_MASK_WALL) {
                walls.push({ x, y });
            }
        }
    }
    const diamondDistances = getDiamondMapping(walls, MAP_SIZE);
    const squareDistances = getSquareMapping(walls, MAP_SIZE);

    const center = getInitialBaseCenter(input.spawn, squareDistances);
    if (center === null) {
        throw new BaseLayoutError(`Cannot find suitable center location for ${input.spawn.x},${input.spawn.y}`);
    }
    const nukerSlot = coreRing(center, input.spawn, false).find(r => r.level === 8)!;
    const nukerInRing = (builtTiles.get(key(nukerSlot.coord)) ?? []).includes(STRUCTURE_NUKER);
    const map = new BaseLayoutMapObj(MAP_SIZE);
    const storage = createRoomCore(center, input.spawn, map, nukerInRing);
    return { map, center, storage, diamondDistances, nukerInRing };
}

/**
 * Finds grid slots for the stamps, the way the v1 extension search did: start from 8 spots
 * around the core, and each accepted slot adds 4 more at (±2, ±2). A slot needs diamond distance
 * 3 from walls and a footprint that fits around the core and the slots already accepted (roads
 * may be shared). Every stamp has the same footprint, so this doesn't depend on what goes in each
 * slot. Unlike v1, a slot found twice is only counted once.
 */
export function findStampSlots(center: Coordinate, diamondDistances: number[][], map: BaseLayoutMapObj, maxSlots: number): Coordinate[] {
    const bodies = new Set<string>();
    const roads = new Set<string>();
    const accepted = new Set<string>();
    const rejected = new Set<string>();
    const slots: Coordinate[] = [];

    const fits = (c: Coordinate): boolean => {
        if (!map.inBounds(c) || diamondDistances[c.y][c.x] < 3) {
            return false;
        }
        for (const { dx, dy } of STAMP_BODY) {
            const t = { x: c.x + dx, y: c.y + dy };
            if (!bodies.has(key(t)) && (!map.isOpen(t) || roads.has(key(t)))) return false;
        }
        for (const { dx, dy } of STAMP_ROADS) {
            const t = { x: c.x + dx, y: c.y + dy };
            if (roads.has(key(t))) continue;
            if (bodies.has(key(t)) || !map.isOpenOrType(t, STRUCTURE_ROAD)) return false;
        }
        return true;
    };

    const queue = CENTER_RING_TO_EXPANSION_OFFSETS.map(o => ({ x: center.x + o.x, y: center.y + o.y }));
    let candidates = 0;
    while (queue.length > 0 && candidates < MAX_SLOT_CANDIDATES && slots.length < maxSlots) {
        const c = queue.shift()!;
        candidates++;
        if (accepted.has(key(c)) || rejected.has(key(c))) continue;
        if (!fits(c)) {
            // The footprint only fills up, so a slot that doesn't fit never will.
            rejected.add(key(c));
            continue;
        }
        accepted.add(key(c));
        slots.push(c);
        STAMP_BODY.forEach(({ dx, dy }) => bodies.add(key({ x: c.x + dx, y: c.y + dy })));
        STAMP_ROADS.forEach(({ dx, dy }) => roads.add(key({ x: c.x + dx, y: c.y + dy })));
        queue.push({ x: c.x + 2, y: c.y + 2 }, { x: c.x - 2, y: c.y + 2 }, { x: c.x + 2, y: c.y - 2 }, { x: c.x - 2, y: c.y - 2 });
    }
    return slots;
}

/** Plans a rampart over every protected structure, from PROTECTIVE_RAMPART_RCL or the structure's RCL. */
function addProtectiveRamparts(map: BaseLayoutMapObj): void {
    for (const [level, coords] of Object.entries(map.toSerializedMap())) {
        for (const c of [...coords]) {
            const { coord, structure } = basePlanCoordToBuildingObj(c);
            if (PROTECTED_STRUCTURES.has(structure)) {
                map.addRampart(Math.max(Number(level), PROTECTIVE_RAMPART_RCL), coord);
            }
        }
    }
}

/** The previous layout's tiles (ignoring ramparts, which share tiles): symbol and level by "x_y". */
function previousLayoutTiles(layout: BaseLayoutMap | undefined): Map<string, { structure: BuildableStructureConstant, level: number }> {
    const tiles = new Map<string, { structure: BuildableStructureConstant, level: number }>();
    for (const [level, coords] of Object.entries(layout ?? {})) {
        for (const c of coords) {
            const { coord, structure } = basePlanCoordToBuildingObj(c);
            if (structure === STRUCTURE_RAMPART) continue;
            tiles.set(key(coord), { structure, level: Number(level) });
        }
    }
    return tiles;
}

/** What the previous layout put in a grid slot, or undefined if it planned no stamp there. */
function previousAssignment(slot: Coordinate, previous: Map<string, { structure: BuildableStructureConstant, level: number }>): StampAssignment | undefined {
    const at = previous.get(key(slot));
    if (at?.structure === STRUCTURE_EXTENSION) return { kind: 'extension', level: at.level };
    if (at?.structure === STRUCTURE_TOWER) return TOWER_STAMP;
    if (previous.get(key({ x: slot.x, y: slot.y - 1 }))?.structure === STRUCTURE_SPAWN) return SPAWN_STAMP;
    return undefined;
}

/**
 * Gets an initial center for the base, or returns null if no center can be found.
 * @param initialCoordinate: The initial coordinate to search from. This should
 *     be something in the "core" square of a base (like a Spawn).
 * @param squareDistances: The calculated minimum 8-way distances to walls/edges
 *     for each square in the map.
 * @return A coordinate that satisfies a base center, or null if no coordinate
 *     can be found.
*/
export function getInitialBaseCenter(initialCoordinate: Coordinate, squareDistances: number[][]): Coordinate | null {
    for (let y = initialCoordinate.y - 1; y <= initialCoordinate.y + 1; y++) {
        for (let x = initialCoordinate.x - 1; x <= initialCoordinate.x + 1; x++) {
            if (x == initialCoordinate.x && y == initialCoordinate.y) {
                continue;
            }
            if (squareDistances[y][x] >= BASE_CENTER_RADIUS) {
                return { x: x, y: y };
            }
        }
    }
    return null;
}

/** The core ring's tiles and what each holds (the spawn at RCL 1). */
function coreRing(center: Coordinate, spawn: Coordinate, nukerInRing: boolean): { coord: Coordinate, level: number, building: BuildableStructureConstant }[] {
    const buildings = centerBuildings(nukerInRing);
    let index = 0;
    return CENTER_RING_OFFSETS.map(offset => {
        const coord = { x: center.x + offset.x, y: center.y + offset.y };
        // TODO: Don't assume spawn is already spawned
        if (coord.x === spawn.x && coord.y === spawn.y) {
            return { coord, level: 1, building: STRUCTURE_SPAWN };
        }
        const b = buildings[index++];
        return { coord, level: b.level, building: b.building };
    });
}

/** Places the core: a ring road, the ring of hub structures, and the center rampart. Returns the storage tile. */
function createRoomCore(centerLocation: Coordinate, spawnCoord: Coordinate, baseMap: BaseLayoutMapObj, nukerInRing: boolean): Coordinate {
    // Add roads around 3x3 center, leaving corners
    for (let i = -1; i <= 1; i++) {
        baseMap.addBuilding(1, { x: centerLocation.x + i, y: centerLocation.y - 2 }, STRUCTURE_ROAD);
        baseMap.addBuilding(1, { x: centerLocation.x + i, y: centerLocation.y + 2 }, STRUCTURE_ROAD);
        baseMap.addBuilding(1, { x: centerLocation.x - 2, y: centerLocation.y + i }, STRUCTURE_ROAD);
        baseMap.addBuilding(1, { x: centerLocation.x + 2, y: centerLocation.y + i }, STRUCTURE_ROAD);
    }

    let storage = centerLocation;
    for (const { coord, level, building } of coreRing(centerLocation, spawnCoord, nukerInRing)) {
        baseMap.addBuilding(level, coord, building);
        if (building === STRUCTURE_STORAGE) storage = coord;
    }

    // Start center rampart at 5 for now
    baseMap.addBuilding(5, centerLocation, STRUCTURE_RAMPART);
    return storage;
}

/** Whether a tile is free for a new non-road structure: not a wall, not planned, nothing built, not reserved. */
function isFree(c: Coordinate, input: LayoutInput, plan: TerrainPlan): boolean {
    return c.x >= 1 && c.y >= 1 && c.x <= 48 && c.y <= 48
        && input.terrain(c.x, c.y) !== TERRAIN_MASK_WALL
        && plan.map.isOpen(c)
        && !plan.builtTiles.has(key(c))
        && !plan.reserved.has(key(c))
        && !(input.mineral && c.x === input.mineral.x && c.y === input.mineral.y);
}

/**
 * Places the 10-lab stamp after the stamp grid: all 16 tiles free (its road tiles may reuse
 * planned or built roads), its two road ends joined to the base's roads, closest to storage.
 * A spot with only one joined end is used if no spot has both.
 */
function placeLabs(input: LayoutInput, plan: TerrainPlan): void {
    const { map } = plan;
    // Tile grids, computed once: this search looks at ~3,600 spots of 16 tiles each.
    const grid = <T>(f: (c: Coordinate) => T): T[][] =>
        Array.from({ length: MAP_SIZE }, (_, y) => Array.from({ length: MAP_SIZE }, (_, x) => f({ x, y })));
    const road = grid(c => map.isType(c, STRUCTURE_ROAD) || plan.builtRoads.has(key(c)));
    const free = grid(c => isFree(c, input, plan));
    // A tile with a lab already built on it is fine for a lab (replanning keeps built labs).
    const builtLab = grid(c => {
        const built = plan.builtTiles.get(key(c)) ?? [];
        return map.isOpen(c) && built.length > 0 && built.every(s => s === STRUCTURE_LAB);
    });
    // A road end is joined when any neighbor is a planned or built road. (A neighbor inside the
    // stamp can only be a road if the stamp reuses an existing road, which joins it too.)
    const nearRoad = grid(c => neighbors(c).some(n => road[n.y][n.x]));
    type Spot = { origin: Coordinate, stamp: readonly StampTile[], keeps: number, joined: number, score: [number, number] };
    let best: Spot | null = null;

    for (const stamp of [LAB_STAMP, mirroredLabStamp()]) {
        const roadEnds = stamp.filter(t => t.structure === STRUCTURE_ROAD && (t.dx === 0 || t.dx === 3) && (t.dy === 0 || t.dy === 3));
        const labTiles = stamp.filter(t => t.structure === STRUCTURE_LAB);
        for (let oy = 2; oy <= 44; oy++) {
            for (let ox = 2; ox <= 44; ox++) {
                const fits = stamp.every(t => {
                    const x = ox + t.dx, y = oy + t.dy;
                    if (t.structure === STRUCTURE_ROAD) {
                        return road[y][x] || free[y][x];
                    }
                    return builtLab[y][x] || (free[y][x] && !road[y][x]);
                });
                if (!fits) continue;
                let joined = 0;
                for (const end of roadEnds) if (nearRoad[oy + end.dy][ox + end.dx]) joined++;
                if (joined === 0) continue;
                let keeps = 0;
                const score: [number, number] = [Infinity, Infinity];
                for (const t of labTiles) {
                    const lab = { x: ox + t.dx, y: oy + t.dy };
                    if (builtLab[lab.y][lab.x]) keeps++;
                    score[0] = Math.min(score[0], range(lab, plan.storage));
                    score[1] = Math.min(score[1], manhattan(lab, plan.storage));
                }
                // Most built labs kept, then both road ends joined, then closest to storage.
                const better = best === null || keeps > best.keeps || (keeps === best.keeps && (joined > best.joined
                    || (joined === best.joined && (score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1])))));
                if (better) best = { origin: { x: ox, y: oy }, stamp, keeps, joined, score };
            }
        }
    }

    if (best === null) {
        plan.warnings.push('no lab spot');
        return;
    }
    for (const t of best.stamp) {
        addIfOpen(map, t.level, { x: best.origin.x + t.dx, y: best.origin.y + t.dy }, t.structure);
    }
}

/**
 * A road path from the spawn to `goal` that avoids planned structures and reuses planned and
 * built roads. Returns the path's tiles (ending at the goal for range 0), or null if there's none.
 */
function roadPath(input: LayoutInput, plan: TerrainPlan, goal: Coordinate, goalRange: number): Coordinate[] | null {
    const matrix = plan.map.toCostMatrix(1);
    for (const road of plan.builtRoads) {
        const [x, y] = road.split('_').map(Number);
        if (plan.map.isOpen({ x, y })) matrix.set(x, y, 1);
    }
    for (const tile of plan.reserved) {
        const [x, y] = tile.split('_').map(Number);
        if (x !== goal.x || y !== goal.y) matrix.set(x, y, 0xff);
    }
    if (input.mineral && (input.mineral.x !== goal.x || input.mineral.y !== goal.y)) {
        matrix.set(input.mineral.x, input.mineral.y, 0xff);
    }
    const result = PathFinder.search(
        new RoomPosition(input.spawn.x, input.spawn.y, input.roomName),
        { pos: new RoomPosition(goal.x, goal.y, input.roomName), range: goalRange },
        { plainCost: 2, swampCost: 10, maxRooms: 1, roomCallback: roomName => roomName === input.roomName ? matrix : false });
    if (result.incomplete || result.path.length === 0) {
        return null;
    }
    return result.path.map(p => ({ x: p.x, y: p.y }));
}

function addIfOpen(map: BaseLayoutMapObj, level: number, c: Coordinate, structure: BuildableStructureConstant): void {
    if (map.isOpenOrType(c, structure)) {
        map.addBuilding(level, c, structure);
    }
}

/** Every planned or blocked tile, plus reserved ones, as "x_y". */
function plannedOrBlocked(map: BaseLayoutMapObj, plan: TerrainPlan): Set<string> {
    const tiles = new Set(plan.reserved);
    for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
            if (!map.isOpen({ x, y })) tiles.add(`${x}_${y}`);
        }
    }
    return tiles;
}

function neighbors(c: Coordinate): Coordinate[] {
    const result: Coordinate[] = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const n = { x: c.x + dx, y: c.y + dy };
            if (n.x >= 0 && n.y >= 0 && n.x < MAP_SIZE && n.y < MAP_SIZE) result.push(n);
        }
    }
    return result;
}

/** The tile closest to `target` by range, ties by Manhattan distance, then scan order. */
function closest(tiles: readonly Coordinate[], target: Coordinate): Coordinate | undefined {
    return [...tiles].sort((a, b) => range(a, target) - range(b, target) || manhattan(a, target) - manhattan(b, target)
        || a.y - b.y || a.x - b.x)[0];
}

/** Built structures from the previous layout that the new layout no longer has (should be none). */
function movedStructures(existing: ExistingBase | undefined, layout: BaseLayoutMap): string[] {
    if (!existing) return [];
    const planned = new Set(Object.values(layout).flat());
    const previous = new Set(Object.values(existing.layout).flat());
    const problems: string[] = [];
    for (const b of existing.built) {
        if (b.structure === STRUCTURE_ROAD) continue;
        if (previous.has(`${b.x}_${b.y}_${symbolFor(b.structure)}`) &&!planned.has(`${b.x}_${b.y}_${symbolFor(b.structure)}`)) {
            problems.push(`built ${b.structure} at ${b.x},${b.y} is no longer planned`);
        }
    }
    return problems;
}

/** A structure's layout symbol, or '?' for types layouts never plan (e.g. the controller). */
function symbolFor(structure: StructureConstant): string {
    try {
        return buildableStructureToChar(structure as BuildableStructureConstant);
    } catch {
        return '?';
    }
}

/**
 * Picks the controller container's tile: 2 tiles from the controller (so upgraders at range 1–3
 * can reach both), not a wall, not on a planned layout tile and not on the room edge. Closest to
 * the spawn by range, ties broken by Manhattan distance (the most direct tile), then scan order.
 */
export function chooseControllerContainerTile(
    controller: Coordinate,
    spawn: Coordinate,
    isWall: (x: number, y: number) => boolean,
    plannedTiles: ReadonlySet<string>): Coordinate | undefined {
    let best: Coordinate | undefined;
    let bestScore: [number, number] = [Infinity, Infinity];
    for (let y = controller.y - 2; y <= controller.y + 2; y++) {
        for (let x = controller.x - 2; x <= controller.x + 2; x++) {
            if (Math.max(Math.abs(x - controller.x), Math.abs(y - controller.y)) !== 2) continue;
            if (x < 1 || y < 1 || x > 48 || y > 48) continue;
            if (isWall(x, y) || plannedTiles.has(`${x}_${y}`)) continue;
            const dx = Math.abs(x - spawn.x);
            const dy = Math.abs(y - spawn.y);
            const score: [number, number] = [Math.max(dx, dy), dx + dy];
            if (score[0] < bestScore[0] || (score[0] === bestScore[0] && score[1] < bestScore[1])) {
                best = { x, y };
                bestScore = score;
            }
        }
    }
    return best;
}
