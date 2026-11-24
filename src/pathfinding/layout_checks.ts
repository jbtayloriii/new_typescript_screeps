import { BaseLayoutMap, Coordinate } from "global_types";
import { basePlanCoordToBuildingObj } from "utils/string_utils";

/** Structure types that can share a tile with a rampart. */
const RAMPART_COMPANIONS: ReadonlySet<StructureConstant> = new Set([STRUCTURE_ROAD, STRUCTURE_CONTAINER]);

/** Structures creeps can walk over. */
const WALKABLE: ReadonlySet<StructureConstant> = new Set([STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_RAMPART]);

export interface LayoutCheckInput {
    readonly layout: BaseLayoutMap;
    readonly isWall: (x: number, y: number) => boolean;
    /** Tiles creeps can't stand on besides walls: sources, the controller, the mineral. */
    readonly obstacles: readonly Coordinate[];
    /** A walkable tile in the core (its center), where the reachability check starts. */
    readonly core: Coordinate;
}

/** The checks every planned layout must pass (docs/BASE_LAYOUT.md). Returns one line per problem. */
export function checkLayout(input: LayoutCheckInput): string[] {
    const problems: string[] = [];
    const planned = Object.entries(input.layout).flatMap(([level, coords]) =>
        coords.map(c => ({ level: Number(level), ...basePlanCoordToBuildingObj(c) })));

    // Per-RCL counts within CONTROLLER_STRUCTURES.
    for (let rcl = 1; rcl <= 8; rcl++) {
        const counts = new Map<BuildableStructureConstant, number>();
        for (const p of planned) {
            if (p.level <= rcl) counts.set(p.structure, (counts.get(p.structure) ?? 0) + 1);
        }
        for (const [structure, count] of counts) {
            const allowed = CONTROLLER_STRUCTURES[structure][rcl];
            if (count > allowed) {
                problems.push(`RCL ${rcl}: ${count} ${structure} planned, ${allowed} allowed`);
            }
        }
    }

    // One structure per tile, except ramparts over roads and containers.
    const byTile = new Map<string, BuildableStructureConstant[]>();
    for (const p of planned) {
        const key = `${p.coord.x}_${p.coord.y}`;
        byTile.set(key, [...(byTile.get(key) ?? []), p.structure]);
    }
    for (const [key, types] of byTile) {
        if (types.length < 2) continue;
        const others = types.filter(t => t !== STRUCTURE_RAMPART);
        const ok = types.length === 2 && others.length === 1 && RAMPART_COMPANIONS.has(others[0]);
        if (!ok) problems.push(`tile ${key} has ${types.join(' + ')}`);
    }

    // Every non-road structure has a walkable neighbor reachable from the core.
    const obstacles = new Set(input.obstacles.map(c => `${c.x}_${c.y}`));
    const walkable = (x: number, y: number) => {
        if (x < 0 || y < 0 || x > 49 || y > 49 || input.isWall(x, y) || obstacles.has(`${x}_${y}`)) return false;
        return (byTile.get(`${x}_${y}`) ?? []).every(t => WALKABLE.has(t));
    };
    const reached = new Set<string>();
    const queue: Coordinate[] = walkable(input.core.x, input.core.y) ? [input.core] : [];
    reached.add(`${input.core.x}_${input.core.y}`);
    while (queue.length > 0) {
        const { x, y } = queue.shift()!;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const key = `${x + dx}_${y + dy}`;
                if (!reached.has(key) && walkable(x + dx, y + dy)) {
                    reached.add(key);
                    queue.push({ x: x + dx, y: y + dy });
                }
            }
        }
    }
    for (const p of planned) {
        if (WALKABLE.has(p.structure)) continue;
        let ok = false;
        for (let dy = -1; dy <= 1 && !ok; dy++) {
            for (let dx = -1; dx <= 1 && !ok; dx++) {
                ok = (dx !== 0 || dy !== 0) && reached.has(`${p.coord.x + dx}_${p.coord.y + dy}`);
            }
        }
        if (!ok) problems.push(`${p.structure} at ${p.coord.x},${p.coord.y} can't be reached from the core`);
    }

    // Reactions need two input labs within range 2 of every other lab.
    const labs = planned.filter(p => p.structure === STRUCTURE_LAB).map(p => p.coord);
    if (labs.length >= 3) {
        const inRange = (a: Coordinate) => labs.every(b => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 2);
        if (labs.filter(inRange).length < 2) {
            problems.push('no two labs are within range 2 of all the others');
        }
    }
    return problems;
}
