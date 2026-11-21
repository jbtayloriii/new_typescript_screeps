import { IntelMap } from "intel/types";
import { getRange } from "snapshot/queries";
import { MyCreepSnapshot, Pos, RoomSnapshot } from "snapshot/types";
import { WorldSnapshot } from "snapshot/world";
import { basePlanCoordToBuildingObj } from "utils/string_utils";
import { MINER_COST } from "./mine_task";
import { chooseNewRemoteRooms } from "./remote_selection";
import { TaskMemory, TaskSpec } from "./types";

export interface PlanTasksInput {
    readonly world: WorldSnapshot;
    readonly home: RoomSnapshot;
    readonly baseMemory: Readonly<BaseMemory>;
    /** The base's current tasks (finished ones already removed). */
    readonly tasks: readonly TaskMemory[];
    readonly creepsByTask: ReadonlyMap<string, readonly MyCreepSnapshot[]>;
    readonly intel: IntelMap;
    /** Rooms other bases use (as bases or remotes). */
    readonly unavailableRooms: readonly RoomName[];
}

export interface TaskChanges {
    readonly remove: readonly string[];
    readonly create: readonly TaskSpec[];
}

/**
 * How the base mines its own sources:
 * - 'static' (mine + haul tasks) once the room can afford a full miner.
 * - 'harvest' (walking harvesters) while bootstrapping, and on collapse: no living miner and not
 *   enough energy to spawn one. Haulers alone don't count, since they can't produce energy.
 * A base already mining statically stays static until collapse, even if its capacity drops (e.g.
 * extensions destroyed): leaving early would orphan miners that no other task can use. Whether
 * containers exist is deliberately not part of this either, so losing one never flips modes.
 */
export function chooseMiningMode(
    home: RoomSnapshot,
    tasks: readonly TaskMemory[],
    creepsByTask: ReadonlyMap<string, readonly MyCreepSnapshot[]>): 'harvest' | 'static' {
    const alreadyStatic = tasks.some(t => t.type === 'mine');
    if (!alreadyStatic && home.energyCapacityAvailable < MINER_COST) {
        return 'harvest';
    }
    const livingMiners = tasks
        .filter(t => t.type === 'mine')
        .reduce((sum, t) => sum + (creepsByTask.get(t.name)?.length ?? 0), 0);
    const collapsed = livingMiners === 0 && home.energyAvailable < MINER_COST;
    return collapsed ? 'harvest' : 'static';
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
 * - Per source: a mine task in static mode, or a harvest task in harvest mode (dropping the other).
 * - A haul task once there are mine tasks (kept afterwards, so existing haulers keep working).
 * - Upgrade while the controller is mine; build while there are sites; repair always.
 * - A scout from RCL 2.
 * - Remote mine tasks for new remote rooms, in static mode.
 */
export function planTasks(input: PlanTasksInput): TaskChanges {
    const { home, tasks } = input;
    const remove: string[] = [];
    const create: TaskSpec[] = [];
    const has = (type: TaskMemory['type']) => tasks.some(t => t.type === type);
    const mode = chooseMiningMode(home, tasks, input.creepsByTask);

    for (const source of home.sources) {
        const forSource = (type: 'mine' | 'harvest') =>
            tasks.find(t => t.type === type && t.sourceId === source.id);
        const keep = mode === 'static' ? 'mine' : 'harvest';
        const drop = mode === 'static' ? 'harvest' : 'mine';
        const old = forSource(drop);
        if (old) {
            remove.push(old.name);
        }
        if (!forSource(keep)) {
            create.push(keep === 'mine'
                ? { type: 'mine', sourceId: source.id, containerTile: findContainerTile(input.baseMemory.baseLayout, source.pos) }
                : { type: 'harvest', sourceId: source.id });
        }
    }
    if (mode === 'static' && !has('haul')) {
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
    if ((home.controller?.level ?? 0) >= 2 && !has('scout')) {
        create.push({ type: 'scout' });
    }
    if (mode === 'static') {
        const current = tasks.flatMap(t => t.type === 'remoteMine' ? [t.targetRoom] : []);
        for (const targetRoom of chooseNewRemoteRooms({
            energyCapacity: home.energyCapacityAvailable,
            neighbors: input.world.getExits(home.name),
            intel: input.intel,
            myUsername: input.world.myUsername,
            tick: input.world.tick,
            current,
            unavailable: input.unavailableRooms,
        })) {
            create.push({ type: 'remoteMine', targetRoom });
        }
    }
    return { remove, create };
}
