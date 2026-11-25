import { Logger } from "logging/logger";
import { Intent, IntentResult, IntentReturnCode } from "./types";

/**
 * Applies intents to the game, in order, and returns each intent's return code.
 *
 * This should stay a direct translation of intents to API calls with no decision logic, so it
 * needs only light testing. Objects that no longer exist return ERR_NOT_FOUND (for creeps) or
 * ERR_INVALID_TARGET (for targets) instead of throwing.
 */
export function executeIntents(intents: readonly Intent[]): IntentResult[] {
    return intents.map(intent => ({ intent, code: executeIntent(intent) }));
}

export function executeIntent(intent: Intent): IntentReturnCode {
    switch (intent.kind) {
        case 'move': {
            const creep = Game.creeps[intent.creepName];
            if (!creep) return ERR_NOT_FOUND;
            const target = new RoomPosition(intent.target.x, intent.target.y, intent.target.roomName);
            const next = intent.route && nextRouteRoom(creep.room.name, intent.target.roomName, intent.route);
            if (next) {
                // Head for the exit to the next room on the route.
                const exitDirection = Game.map.findExit(creep.room.name, next);
                const exit = exitDirection > 0 ? creep.pos.findClosestByPath(exitDirection as ExitConstant) : null;
                if (exit) {
                    return creep.moveTo(exit);
                }
            }
            return creep.moveTo(target, { range: intent.range });
        }
        case 'say': {
            const creep = Game.creeps[intent.creepName];
            if (!creep) return ERR_NOT_FOUND;
            return creep.say(intent.message);
        }
        case 'harvest':
            return withCreepAndTarget(intent.creepName, intent.targetId, (c, t) => c.harvest(t));
        case 'transfer':
            return withCreepAndTarget(intent.creepName, intent.targetId, (c, t) => c.transfer(t, intent.resource));
        case 'withdraw':
            return withCreepAndTarget(intent.creepName, intent.targetId, (c, t) => c.withdraw(t, intent.resource));
        case 'pickup':
            return withCreepAndTarget(intent.creepName, intent.targetId, (c, t) => c.pickup(t));
        case 'build':
            return withCreepAndTarget(intent.creepName, intent.targetId, (c, t) => c.build(t));
        case 'repair':
            return withCreepAndTarget(intent.creepName, intent.targetId, (c, t) => c.repair(t));
        case 'upgrade':
            return withCreepAndTarget(intent.creepName, intent.targetId, (c, t) => c.upgradeController(t));
        case 'spawn': {
            const spawn = Game.getObjectById(intent.spawnId);
            if (!spawn) return ERR_NOT_FOUND;
            return spawn.spawnCreep(intent.body, intent.name, { memory: intent.memory });
        }
        case 'claimController':
            return withCreepAndTarget(intent.creepName, intent.targetId, (c, t) => c.claimController(t));
        case 'reserveController':
            return withCreepAndTarget(intent.creepName, intent.targetId, (c, t) => c.reserveController(t));
        case 'attackController':
            return withCreepAndTarget(intent.creepName, intent.targetId, (c, t) => c.attackController(t));
        case 'attack':
            return withCreepAndTarget(intent.creepName, intent.targetId, (c, t) => c.attack(t));
        case 'rangedAttack':
            return withCreepAndTarget(intent.creepName, intent.targetId, (c, t) => c.rangedAttack(t));
        case 'heal':
            return withCreepAndTarget(intent.creepName, intent.targetId, (c, t) => c.heal(t));
        case 'rangedHeal':
            return withCreepAndTarget(intent.creepName, intent.targetId, (c, t) => c.rangedHeal(t));
        case 'rangedMassAttack': {
            const creep = Game.creeps[intent.creepName];
            if (!creep) return ERR_NOT_FOUND;
            return creep.rangedMassAttack();
        }
        case 'removeFlag': {
            const flag = Game.flags[intent.flagName];
            if (!flag) return ERR_NOT_FOUND;
            return flag.remove();
        }
        case 'activateSafeMode': {
            const controller = Game.getObjectById(intent.controllerId);
            if (!controller) return ERR_NOT_FOUND;
            const result = controller.activateSafeMode();
            // Saved in Memory.log, so a lost base leaves a record of when and why.
            Logger.warning(`[${controller.room?.name}] safe mode ${result === OK ? 'activated' : `failed (${result})`}: ${intent.reason ?? 'no reason given'}`);
            return result;
        }
        case 'recycle': {
            const spawn = Game.getObjectById(intent.spawnId);
            if (!spawn) return ERR_NOT_FOUND;
            const creep = Game.creeps[intent.creepName];
            if (!creep) return ERR_INVALID_TARGET;
            return spawn.recycleCreep(creep);
        }
        case 'setCreepMemory': {
            const memory = Memory.creeps[intent.creepName];
            if (!memory) return ERR_NOT_FOUND;
            applyMemoryPatch(memory, intent.patch);
            return OK;
        }
        case 'towerAttack':
            return withTowerAndTarget(intent.towerId, intent.targetId, (tw, t) => tw.attack(t));
        case 'towerHeal':
            return withTowerAndTarget(intent.towerId, intent.targetId, (tw, t) => tw.heal(t));
        case 'towerRepair':
            return withTowerAndTarget(intent.towerId, intent.targetId, (tw, t) => tw.repair(t));
        case 'createConstructionSite': {
            const room = Game.rooms[intent.pos.roomName];
            if (!room) return ERR_NOT_FOUND;
            return room.createConstructionSite(intent.pos.x, intent.pos.y, intent.structureType);
        }
    }
}

function applyMemoryPatch(memory: CreepMemory, patch: Partial<CreepMemory>): void {
    const target = memory as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) {
            delete target[key];
        } else {
            target[key] = value;
        }
    }
}

function withCreepAndTarget<T extends _HasId>(
    creepName: string,
    targetId: Id<T>,
    action: (creep: Creep, target: T) => IntentReturnCode): IntentReturnCode {
    const creep = Game.creeps[creepName];
    if (!creep) return ERR_NOT_FOUND;
    const target = Game.getObjectById(targetId);
    if (!target) return ERR_INVALID_TARGET;
    return action(creep, target);
}

function withTowerAndTarget<T extends _HasId>(
    towerId: Id<StructureTower>,
    targetId: Id<T>,
    action: (tower: StructureTower, target: T) => IntentReturnCode): IntentReturnCode {
    const tower = Game.getObjectById(towerId);
    if (!tower) return ERR_NOT_FOUND;
    const target = Game.getObjectById(targetId);
    if (!target) return ERR_INVALID_TARGET;
    return action(tower, target);
}

/**
 * The next room to head for along a route: the room after the current one, or the route's first
 * room when the creep isn't on it (e.g. still in its base). Undefined in the target room.
 */
export function nextRouteRoom(current: RoomName, target: RoomName, route: readonly RoomName[]): RoomName | undefined {
    if (current === target || route.length === 0) {
        return undefined;
    }
    const index = route.indexOf(current);
    return index >= 0 ? route[index + 1] : route[0];
}
