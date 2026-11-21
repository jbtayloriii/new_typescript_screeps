import { Coordinate } from "global_types";
import { getInitialBaseCenter } from "pathfinding/base_layout_utils";
import { getSquareMapping, Position } from "pathfinding/map_plot_utils";
import { TerrainView } from "snapshot/world";

/** Keep the first spawn this far from room edges. */
const EDGE_MARGIN = 4;

/**
 * Picks where a newly claimed room's first spawn goes: a tile where the base layout can fit its
 * 3×3 core next to the spawn (the same check the layout planner makes), as close as possible to
 * the room's sources and controller. Null if no tile fits.
 */
export function chooseSpawnPosition(
    terrain: TerrainView,
    sources: readonly Coordinate[],
    controller: Coordinate | undefined): Coordinate | null {
    const walls: Position[] = [];
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            if (terrain.isWall(x, y)) {
                walls.push({ x, y });
            }
        }
    }
    const squareDistances = getSquareMapping(walls, 50);
    const targets = controller ? [...sources, controller] : [...sources];
    const range = (a: Coordinate, b: Coordinate) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

    let best: Coordinate | null = null;
    let bestScore = Infinity;
    for (let y = EDGE_MARGIN; y < 50 - EDGE_MARGIN; y++) {
        for (let x = EDGE_MARGIN; x < 50 - EDGE_MARGIN; x++) {
            if (terrain.isWall(x, y) || getInitialBaseCenter({ x, y }, squareDistances) === null) {
                continue;
            }
            const score = targets.reduce((sum, t) => sum + range({ x, y }, t), 0);
            if (score < bestScore) {
                best = { x, y };
                bestScore = score;
            }
        }
    }
    return best;
}
