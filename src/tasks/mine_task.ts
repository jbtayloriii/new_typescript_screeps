import { Intent } from "intents/types";
import { getRange } from "snapshot/queries";
import { MyCreepSnapshot, Pos } from "snapshot/types";
import { bodyCost, spawnTicks, ticksPerTile } from "spawning/body";
import { BodyPattern, MineTaskMemory, TaskDefinition } from "./types";

/** 5 WORK parts harvest 10 energy/tick, all a source regenerates. Extra MOVE parts when affordable. */
export const MINER_BODY: BodyPattern = { base: [WORK, WORK, WORK, WORK, WORK, MOVE], pattern: [MOVE], maxRepeats: 2 };
export const MINER_COST = bodyCost(MINER_BODY.base!);

/** With no miner the base's income stops, so the first one outranks everything else. */
export const FIRST_MINER_PRIORITY = 105;
export const REPLACEMENT_MINER_PRIORITY = 98;

/** Path length used when the base hasn't measured the real one yet. */
export const DEFAULT_SOURCE_DISTANCE = 25;

/**
 * True when a miner should be replaced now: its remaining life is less than the time to spawn a
 * replacement plus the replacement's walk to the source.
 */
export function isRetiring(creep: MyCreepSnapshot, distance: number): boolean {
    if (creep.ticksToLive === undefined) {
        return false;
    }
    const parts = Object.values(creep.activeParts).reduce((sum, n) => sum + (n ?? 0), 0);
    return creep.ticksToLive < spawnTicks(parts) + distance * ticksPerTile(creep.activeParts);
}

/**
 * Static mining: one miner parked next to the source, on the container tile when known, so
 * harvested energy drops into the container (or onto the ground without one) for haulers.
 *
 * The container is an optimization, not a requirement: losing it never ends this task. If it's
 * missing, the task places a construction site right away for the build task.
 */
export const mineTask: TaskDefinition<MineTaskMemory> = {
    getSpawnRequests(task, ctx) {
        const distance = ctx.baseMemory.sourceDistances?.[task.sourceId] ?? DEFAULT_SOURCE_DISTANCE;
        if (ctx.creeps.some(c => !isRetiring(c, distance))) {
            return [];
        }
        return [{
            taskName: task.name,
            priority: ctx.creeps.length === 0 ? FIRST_MINER_PRIORITY : REPLACEMENT_MINER_PRIORITY,
            body: MINER_BODY,
        }];
    },

    decide(task, ctx) {
        const source = ctx.home.sources.find(s => s.id === task.sourceId);
        if (!source) {
            return [];
        }
        const tile: Pos | null = task.containerTile
            ? { x: task.containerTile.x, y: task.containerTile.y, roomName: source.pos.roomName }
            : null;
        const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y && a.roomName === b.roomName;
        const intents: Intent[] = [];

        for (const creep of ctx.creeps) {
            if (creep.spawning) {
                continue;
            }
            // A retiring miner may still hold the tile; its replacement mines from beside it.
            const tileTaken = tile !== null && ctx.home.creepsPresent.some(o => o.name !== creep.name && samePos(o.pos, tile));
            const standAt = tile && !tileTaken ? tile : null;
            if (standAt && !samePos(creep.pos, standAt)) {
                intents.push({ kind: 'move', creepName: creep.name, target: standAt, range: 0 });
            } else if (!standAt && getRange(creep.pos, source.pos) > 1) {
                intents.push({ kind: 'move', creepName: creep.name, target: source.pos, range: 1 });
            } else if (source.energy > 0) {
                intents.push({ kind: 'harvest', creepName: creep.name, targetId: source.id });
            }
        }

        if (tile) {
            const at = (s: { pos: Pos, structureType: string }) => s.structureType === STRUCTURE_CONTAINER && samePos(s.pos, tile);
            if (!ctx.home.structures.some(at) && !ctx.home.constructionSites.some(at)) {
                intents.push({ kind: 'createConstructionSite', pos: tile, structureType: STRUCTURE_CONTAINER });
            }
        }
        return intents;
    },

    isDone(task, ctx) {
        return !ctx.home.sources.some(s => s.id === task.sourceId);
    },
};
