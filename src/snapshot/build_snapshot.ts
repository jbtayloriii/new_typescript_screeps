import {
    BodyPartCounts,
    ConstructionSiteSnapshot,
    ControllerSnapshot,
    CreepSnapshotBase,
    DroppedResourceSnapshot,
    EnergyStore,
    HostileCreepSnapshot,
    MyCreepSnapshot,
    Ownership,
    Pos,
    RoomSnapshot,
    RuinSnapshot,
    SourceSnapshot,
    StructureSnapshot,
} from "./types";

/**
 * Builds a plain-data snapshot of a room for the current tick.
 *
 * This is the only place that should read game objects for decision making. Keep it free of
 * logic: just copy fields.
 */
export function buildRoomSnapshot(room: Room, tick: number = Game.time): RoomSnapshot {
    return {
        name: room.name,
        tick: tick,
        controller: room.controller ? toControllerSnapshot(room.controller) : null,
        energyAvailable: room.energyAvailable,
        energyCapacityAvailable: room.energyCapacityAvailable,
        sources: room.find(FIND_SOURCES).map(source => toSourceSnapshot(source, room.getTerrain())),
        // The controller is a structure, but is exposed separately as `controller`.
        structures: room.find(FIND_STRUCTURES)
            .filter(s => s.structureType !== STRUCTURE_CONTROLLER)
            .map(toStructureSnapshot),
        constructionSites: room.find(FIND_MY_CONSTRUCTION_SITES).map(toConstructionSiteSnapshot),
        ruins: room.find(FIND_RUINS).map(toRuinSnapshot),
        droppedResources: room.find(FIND_DROPPED_RESOURCES).map(toDroppedResourceSnapshot),
        creepsPresent: room.find(FIND_MY_CREEPS).map(toMyCreepSnapshot),
        hostileCreeps: room.find(FIND_HOSTILE_CREEPS).map(toHostileCreepSnapshot),
    };
}

function toPos(pos: RoomPosition): Pos {
    return { x: pos.x, y: pos.y, roomName: pos.roomName };
}

function toControllerSnapshot(controller: StructureController): ControllerSnapshot {
    return {
        id: controller.id,
        pos: toPos(controller.pos),
        my: controller.my,
        level: controller.level,
        progress: controller.progress,
        progressTotal: controller.progressTotal,
        ticksToDowngrade: controller.ticksToDowngrade,
        owner: controller.owner?.username,
        reservation: controller.reservation
            ? { username: controller.reservation.username, ticksToEnd: controller.reservation.ticksToEnd }
            : undefined,
        safeMode: controller.safeMode,
        safeModeAvailable: controller.safeModeAvailable,
        safeModeCooldown: controller.safeModeCooldown,
    };
}

function toDroppedResourceSnapshot(resource: Resource): DroppedResourceSnapshot {
    return { id: resource.id, pos: toPos(resource.pos), resourceType: resource.resourceType, amount: resource.amount };
}

function toSourceSnapshot(source: Source, terrain: RoomTerrain): SourceSnapshot {
    return {
        id: source.id,
        pos: toPos(source.pos),
        energy: source.energy,
        energyCapacity: source.energyCapacity,
        openSpots: countOpenSpots(source.pos, (x, y) => terrain.get(x, y) === TERRAIN_MASK_WALL),
    };
}

/** Non-wall tiles around a position, inside the room. */
export function countOpenSpots(pos: { x: number, y: number }, isWall: (x: number, y: number) => boolean): number {
    let open = 0;
    for (let y = pos.y - 1; y <= pos.y + 1; y++) {
        for (let x = pos.x - 1; x <= pos.x + 1; x++) {
            if ((x !== pos.x || y !== pos.y) && x >= 0 && y >= 0 && x <= 49 && y <= 49 && !isWall(x, y)) {
                open++;
            }
        }
    }
    return open;
}

function toStructureSnapshot(structure: AnyStructure): StructureSnapshot {
    const snapshot: { -readonly [K in keyof StructureSnapshot]: StructureSnapshot[K] } = {
        id: structure.id,
        structureType: structure.structureType,
        pos: toPos(structure.pos),
        hits: structure.hits,
        hitsMax: structure.hitsMax,
        owner: getOwnership(structure),
    };
    if ("store" in structure) {
        snapshot.store = toEnergyStore(structure.store as StoreDefinition);
    }
    if (structure.structureType === STRUCTURE_SPAWN) {
        snapshot.spawning = structure.spawning !== null;
    }
    return snapshot;
}

function getOwnership(structure: AnyStructure): Ownership {
    if (!("my" in structure) || structure.my === undefined) {
        return 'none';
    }
    return structure.my ? 'me' : 'other';
}

function toEnergyStore(store: StoreDefinition): EnergyStore {
    return {
        energy: store[RESOURCE_ENERGY],
        energyCapacity: store.getCapacity(RESOURCE_ENERGY) ?? 0,
        freeCapacity: store.getFreeCapacity(RESOURCE_ENERGY) ?? 0,
    };
}

function toRuinSnapshot(ruin: Ruin): RuinSnapshot {
    return { id: ruin.id, pos: toPos(ruin.pos), energy: ruin.store[RESOURCE_ENERGY] };
}

function toConstructionSiteSnapshot(site: ConstructionSite): ConstructionSiteSnapshot {
    return {
        id: site.id,
        structureType: site.structureType,
        pos: toPos(site.pos),
        progress: site.progress,
        progressTotal: site.progressTotal,
    };
}

function countActiveParts(body: BodyPartDefinition[]): BodyPartCounts {
    const counts: Partial<Record<BodyPartConstant, number>> = {};
    for (const part of body) {
        if (part.hits > 0) {
            counts[part.type] = (counts[part.type] ?? 0) + 1;
        }
    }
    return counts;
}

function toCreepSnapshotBase(creep: Creep): CreepSnapshotBase {
    return {
        id: creep.id,
        name: creep.name,
        pos: toPos(creep.pos),
        hits: creep.hits,
        hitsMax: creep.hitsMax,
        activeParts: countActiveParts(creep.body),
        store: toEnergyStore(creep.store),
        spawning: creep.spawning,
        ticksToLive: creep.ticksToLive,
    };
}

export function toMyCreepSnapshot(creep: Creep): MyCreepSnapshot {
    return { ...toCreepSnapshotBase(creep), memory: creep.memory };
}

function toHostileCreepSnapshot(creep: Creep): HostileCreepSnapshot {
    return { ...toCreepSnapshotBase(creep), owner: creep.owner.username };
}
