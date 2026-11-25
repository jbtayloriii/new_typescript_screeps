import { Coordinate } from "global_types";
import { getInitialBaseCenter, planLayoutFromTerrain } from "pathfinding/base_layout_utils";
import { getSquareMapping, Position } from "pathfinding/map_plot_utils";
import { TerrainView } from "snapshot/world";

/**
 * Where a claimed room's first spawn goes (docs/EXPANSION.md, "Choosing the spawn position").
 * Pure: terrain in, evaluation out.
 *
 * 1. Candidates: non-wall tiles at least EDGE_MARGIN from the edges where the 3×3 core fits
 *    (the same `getInitialBaseCenter` check the layout planner makes).
 * 2. Score: walking distance to each source and the controller (flood fills, plains 1, swamps
 *    2), plus a penalty for tiles within EXIT_PENALTY_RANGE of an exit.
 * 3. Whole-layout fit: the best LAYOUT_FIT_CANDIDATES by score run the pure layout planner.
 *    Ones with no shortfalls (12 extension stamps, tower and spawn stamps, a lab spot) beat any
 *    that have some; then the fewest shortfalls, then the score.
 */

/** Keep the first spawn this far from room edges. */
export const EDGE_MARGIN = 4;

/** Tiles this close to an exit (by walking) cost EXIT_PENALTY_PER_TILE for each tile closer. */
export const EXIT_PENALTY_RANGE = 6;
export const EXIT_PENALTY_PER_TILE = 5;

/** How many of the best-scoring candidates get the (slower) whole-layout check. */
export const LAYOUT_FIT_CANDIDATES = 8;

/** Extension stamps a full RCL 8 layout needs (60 extensions). */
export const FULL_EXTENSION_STAMPS = 12;

/** What the spawn position evaluation found, saved on the claim directive (see `cmd.evaluate`). */
export interface ClaimEvaluation {
    readonly spawnPos: { readonly x: number; readonly y: number };
    /** Walking distance from the spawn to each source, in intel order. */
    readonly sourceDistances: readonly number[];
    readonly controllerDistance: number;
    /** Extension stamps the layout fits, of FULL_EXTENSION_STAMPS. */
    readonly extensionStamps: number;
    /** Rooms from the base along the planned route, if known. */
    readonly routeRooms?: number;
    readonly warnings: readonly string[];
}

export interface SpawnEvaluationInput {
    readonly roomName: RoomName;
    readonly terrain: TerrainView;
    readonly sources: readonly Coordinate[];
    readonly controller?: Coordinate;
    readonly mineral?: Coordinate;
    /** A spawn tile given by the command or flag: evaluated as is instead of searching. */
    readonly spawnPos?: Coordinate;
}

const SIZE = 50;

/**
 * Walking distance from every tile to the nearest seed (8-way; plains 1, swamps 2, walls
 * impassable), by Dial's algorithm. Unreached tiles are Infinity.
 */
export function walkingDistances(terrain: TerrainView, seeds: readonly Coordinate[]): number[][] {
    const dist = Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(Infinity));
    const buckets: Coordinate[][] = [[]];
    for (const s of seeds) {
        if (!terrain.isWall(s.x, s.y) && dist[s.y][s.x] > 0) {
            dist[s.y][s.x] = 0;
            buckets[0].push(s);
        }
    }
    for (let d = 0; d < buckets.length; d++) {
        for (const c of buckets[d] ?? []) {
            if (dist[c.y][c.x] !== d) continue;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const x = c.x + dx, y = c.y + dy;
                    if ((dx === 0 && dy === 0) || x < 0 || y < 0 || x >= SIZE || y >= SIZE || terrain.isWall(x, y)) continue;
                    const next = d + (terrain.isSwamp(x, y) ? 2 : 1);
                    if (next < dist[y][x]) {
                        dist[y][x] = next;
                        (buckets[next] ??= []).push({ x, y });
                    }
                }
            }
        }
    }
    return dist;
}

/** The walkable tiles next to a target (a source or controller), to start a flood fill from. */
function standingTiles(terrain: TerrainView, target: Coordinate): Coordinate[] {
    const tiles: Coordinate[] = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const x = target.x + dx, y = target.y + dy;
            if ((dx !== 0 || dy !== 0) && x >= 0 && y >= 0 && x < SIZE && y < SIZE && !terrain.isWall(x, y)) tiles.push({ x, y });
        }
    }
    return tiles;
}

/** Walking distance to the nearest exit tile (non-wall tiles on the room's edge). */
export function exitDistances(terrain: TerrainView): number[][] {
    const exits: Coordinate[] = [];
    for (let i = 0; i < SIZE; i++) {
        for (const c of [{ x: i, y: 0 }, { x: i, y: SIZE - 1 }, { x: 0, y: i }, { x: SIZE - 1, y: i }]) {
            if (!terrain.isWall(c.x, c.y)) exits.push(c);
        }
    }
    return walkingDistances(terrain, exits);
}

/** The score penalty for a tile `distance` from the nearest exit. */
export function exitPenalty(distance: number): number {
    return Math.max(0, EXIT_PENALTY_RANGE + 1 - distance) * EXIT_PENALTY_PER_TILE;
}

/** What the layout planner fits with the spawn at a tile: extension stamps and missing parts. */
export function layoutFit(input: SpawnEvaluationInput, spawn: Coordinate): { extensionStamps: number, shortfalls: string[] } {
    let plan;
    try {
        plan = planLayoutFromTerrain({
            roomName: input.roomName,
            terrain: (x, y) => input.terrain.isWall(x, y) ? TERRAIN_MASK_WALL : input.terrain.isSwamp(x, y) ? TERRAIN_MASK_SWAMP : 0,
            spawn,
            sources: input.sources,
            controller: input.controller,
            mineral: input.mineral,
        });
    } catch {
        return { extensionStamps: 0, shortfalls: ['no room for the base core'] };
    }
    const extensionStamps = plan.assignments.filter(a => a.kind === 'extension').length;
    const shortfalls: string[] = [];
    if (extensionStamps < FULL_EXTENSION_STAMPS) shortfalls.push(`${extensionStamps}/${FULL_EXTENSION_STAMPS} extension stamps`);
    if (!plan.assignments.some(a => a.kind === 'tower')) shortfalls.push('no tower stamp');
    if (!plan.assignments.some(a => a.kind === 'spawn')) shortfalls.push('no spawn stamp');
    if (plan.warnings.includes('no lab spot')) shortfalls.push('no lab spot');
    return { extensionStamps, shortfalls };
}

/**
 * Evaluates where the first spawn goes (see the module comment), or returns why no tile works.
 * With `spawnPos` given, only that tile is evaluated.
 */
export function evaluateSpawnPosition(input: SpawnEvaluationInput): { evaluation: ClaimEvaluation } | { blocker: string } {
    const { terrain } = input;
    const walls: Position[] = [];
    for (let x = 0; x < SIZE; x++) {
        for (let y = 0; y < SIZE; y++) {
            if (terrain.isWall(x, y)) walls.push({ x, y });
        }
    }
    const squareDistances = getSquareMapping(walls, SIZE);
    const sourceFills = input.sources.map(s => walkingDistances(terrain, standingTiles(terrain, s)));
    const controllerFill = input.controller ? walkingDistances(terrain, standingTiles(terrain, input.controller)) : null;
    const exits = exitDistances(terrain);

    const coreFits = (c: Coordinate) => !terrain.isWall(c.x, c.y) && getInitialBaseCenter(c, squareDistances) !== null;
    const scored = (c: Coordinate) => {
        const sourceDistances = sourceFills.map(f => f[c.y][c.x]);
        const controllerDistance = controllerFill ? controllerFill[c.y][c.x] : 0;
        const score = sourceDistances.reduce((a, b) => a + b, 0) + controllerDistance + exitPenalty(exits[c.y][c.x]);
        return { pos: c, sourceDistances, controllerDistance, score };
    };

    let candidates: ReturnType<typeof scored>[];
    const warnings: string[] = [];
    if (input.spawnPos) {
        if (!coreFits(input.spawnPos)) {
            return { blocker: `the base core doesn't fit next to the given spawn tile ${input.spawnPos.x},${input.spawnPos.y}` };
        }
        candidates = [scored(input.spawnPos)];
    } else {
        candidates = [];
        for (let y = EDGE_MARGIN; y < SIZE - EDGE_MARGIN; y++) {
            for (let x = EDGE_MARGIN; x < SIZE - EDGE_MARGIN; x++) {
                if (!coreFits({ x, y })) continue;
                const s = scored({ x, y });
                if (Number.isFinite(s.score)) candidates.push(s);
            }
        }
        if (candidates.length === 0) {
            return { blocker: 'no tile fits the base core within reach of the sources and controller' };
        }
        candidates.sort((a, b) => a.score - b.score || a.pos.y - b.pos.y || a.pos.x - b.pos.x);
        candidates = candidates.slice(0, LAYOUT_FIT_CANDIDATES);
    }

    const fitted = candidates.map(c => ({ ...c, fit: layoutFit(input, c.pos) }))
        .sort((a, b) => a.fit.shortfalls.length - b.fit.shortfalls.length || a.score - b.score);
    const best = fitted[0];
    if (!Number.isFinite(best.score)) {
        warnings.push('the spawn tile can\'t reach every source and the controller');
    }
    if (input.sources.length < 2) {
        warnings.push(`only ${input.sources.length} source${input.sources.length === 1 ? '' : 's'}`);
    }
    if (best.fit.shortfalls.length > 0) {
        warnings.push(`layout short: ${best.fit.shortfalls.join(', ')}`);
    }
    return {
        evaluation: {
            spawnPos: { x: best.pos.x, y: best.pos.y },
            sourceDistances: best.sourceDistances,
            controllerDistance: best.controllerDistance,
            extensionStamps: best.fit.extensionStamps,
            warnings,
        },
    };
}

/** The chosen spawn tile, or null if none works. See `evaluateSpawnPosition`. */
export function chooseSpawnPosition(
    terrain: TerrainView,
    sources: readonly Coordinate[],
    controller: Coordinate | undefined): Coordinate | null {
    const result = evaluateSpawnPosition({ roomName: 'sim', terrain, sources, controller });
    return 'evaluation' in result ? result.evaluation.spawnPos : null;
}
