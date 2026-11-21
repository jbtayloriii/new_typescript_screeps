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
        case 'removeFlag': {
            const flag = Game.flags[intent.flagName];
            if (!flag) return ERR_NOT_FOUND;
            return flag.remove();
        }
        case 'activateSafeMode': {
            const controller = Game.getObjectById(intent.controllerId);
            if (!controller) return ERR_NOT_FOUND;
            return controller.activateSafeMode();
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
