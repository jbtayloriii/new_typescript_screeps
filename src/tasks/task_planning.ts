import { IntelMap } from "intel/types";
import { getRange } from "snapshot/queries";
import { MyCreepSnapshot, Pos, RoomSnapshot } from "snapshot/types";
import { WorldSnapshot } from "snapshot/world";
import { basePlanCoordToBuildingObj } from "utils/string_utils";
import { needsHauling } from "./mine_task";
import { Directive } from "directives/types";
import { MineTaskMemory, TaskMemory, TaskSpec } from "./types";

export interface PlanTasksInput {
    readonly world: WorldSnapshot;
    readonly home: RoomSnapshot;
    readonly baseMemory: Readonly<BaseMemory>;
    /** The base's current tasks (finished ones already removed). */
    readonly tasks: readonly TaskMemory[];
    readonly creepsByTask: ReadonlyMap<string, readonly MyCreepSnapshot[]>;
    readonly intel: IntelMap;
    /** Active directives assigned to this base. */
    readonly directives: readonly Directive[];
}

export interface TaskChanges {
    readonly remove: readonly string[];
    readonly create: readonly TaskSpec[];
}

/** The base layout's planned container next to a source (where its miner should stand). */
export function findContainerTile(baseLayout: BaseMemory['baseLayout'], source: Pos): { x: number, y: number } | undefined {
    for (const coords of Object.values(baseLayout)) {
        for (const coordString of coords) {
            const { coord, structure } = basePlanCoordToBuildingObj(coordString);
            if (structure === STRUCTURE_CONTAINER && getRange({ ...coord, roomName: source.roomName }, source) === 1) {
                return coord;
            }
        }
    }
    return undefined;
}

/**
 * Decides which tasks the base should add or drop:
 * - A mine task per source (it adapts from harvesters to a static miner by itself).
 * - A haul task once any source needs hauling: it has a container, or a miner works it (kept
 *   afterwards, so existing haulers keep working).
 * - Upgrade while the controller is mine; build while there are sites; repair always.
 * - A routine scout from RCL 2.
 * - One task per active directive assigned to the base; tasks whose directive ended are dropped.
 *   (Choosing remote rooms is now the empire planner's job: see `directives/planning.ts`.)
 */
export function planTasks(input: PlanTasksInput): TaskChanges {
    const { home, tasks } = input;
    const remove: string[] = [];
    const create: TaskSpec[] = [];
    const has = (type: TaskMemory['type']) => tasks.some(t => t.type === type);

    for (const source of home.sources) {
        if (!tasks.some(t => t.type === 'mine' && t.sourceId === source.id)) {
            create.push({ type: 'mine', sourceId: source.id, containerTile: findContainerTile(input.baseMemory.baseLayout, source.pos) });
        }
    }
    const mines = tasks.filter((t): t is MineTaskMemory => t.type === 'mine');
    if (!has('haul') && mines.some(t => needsHauling(t, home))) {
        create.push({ type: 'haul' });
    }
    if (home.controller?.my && !has('upgrade')) {
        create.push({ type: 'upgrade' });
    }
    if (home.constructionSites.length > 0 && !has('build')) {
        create.push({ type: 'build' });
    }
    if (!has('repair')) {
        create.push({ type: 'repair' });
    }
    if ((home.controller?.level ?? 0) >= 2 && !tasks.some(t => t.type === 'scout' && !t.targetRoom)) {
        create.push({ type: 'scout' });
    }

    const activeIds = new Set(input.directives.map(d => d.id));
    for (const task of tasks) {
        const directiveId = 'directiveId' in task ? task.directiveId : undefined;
        const directiveDriven = task.type === 'remoteMine' || task.type === 'claim' || (task.type === 'scout' && task.targetRoom);
        if (directiveDriven && (!directiveId || !activeIds.has(directiveId))) {
            remove.push(task.name);
        }
    }
    for (const d of input.directives) {
        if (!tasks.some(t => 'directiveId' in t && t.directiveId === d.id)) {
            create.push({ type: d.type, targetRoom: d.targetRoom, directiveId: d.id });
        }
    }
    return { remove, create };
}
