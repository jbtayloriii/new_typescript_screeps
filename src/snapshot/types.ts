/**
 * Plain-data views of game state for a single tick.
 *
 * Decision logic reads these instead of `Game`/`Room` objects, so it can be unit tested with
 * plain objects (see `testing/builders/room_snapshot_builder.ts`). Snapshots are built once per
 * tick by `buildRoomSnapshot` and must not be kept across ticks.
 *
 * Add fields here as decision logic needs them, rather than mirroring the whole game API.
 */

export interface Pos {
    readonly x: number;
    readonly y: number;
    readonly roomName: RoomName;
}

export interface EnergyStore {
    readonly energy: number;
    /** Total energy this object can hold. */
    readonly energyCapacity: number;
    /** Energy that can still be added. Less than `energyCapacity - energy` if other resources are stored. */
    readonly freeCapacity: number;
}

/** Who owns a structure. Neutral structures (roads, containers, walls) have no owner. */
export type Ownership = 'me' | 'other' | 'none';

export interface StructureSnapshot {
    readonly id: Id<Structure>;
    readonly structureType: StructureConstant;
    readonly pos: Pos;
    readonly hits: number;
    readonly hitsMax: number;
    readonly owner: Ownership;
    /** Present for structures with a store (spawns, extensions, towers, containers, storage...). */
    readonly store?: EnergyStore;
    /** Present for spawns. */
    readonly spawning?: boolean;
}

export interface ControllerSnapshot {
    readonly id: Id<StructureController>;
    readonly pos: Pos;
    readonly my: boolean;
    readonly level: number;
    readonly progress: number;
    readonly progressTotal: number;
    readonly ticksToDowngrade: number;
}

export interface SourceSnapshot {
    readonly id: Id<Source>;
    readonly pos: Pos;
    readonly energy: number;
    readonly energyCapacity: number;
}

export interface RuinSnapshot {
    readonly id: Id<Ruin>;
    readonly pos: Pos;
    readonly energy: number;
}

export interface ConstructionSiteSnapshot {
    readonly id: Id<ConstructionSite>;
    readonly structureType: BuildableStructureConstant;
    readonly pos: Pos;
    readonly progress: number;
    readonly progressTotal: number;
}

/** Number of active (undamaged) body parts of each type. */
export type BodyPartCounts = Readonly<Partial<Record<BodyPartConstant, number>>>;

export interface CreepSnapshotBase {
    readonly id: Id<Creep>;
    readonly name: string;
    readonly pos: Pos;
    readonly hits: number;
    readonly hitsMax: number;
    readonly activeParts: BodyPartCounts;
    readonly store: EnergyStore;
    readonly spawning: boolean;
    /** Undefined while spawning. */
    readonly ticksToLive?: number;
}

export interface MyCreepSnapshot extends CreepSnapshotBase {
    readonly memory: Readonly<CreepMemory>;
}

export interface HostileCreepSnapshot extends CreepSnapshotBase {
    readonly owner: string;
}

export interface RoomSnapshot {
    readonly name: RoomName;
    readonly tick: number;
    readonly controller: ControllerSnapshot | null;
    readonly energyAvailable: number;
    readonly energyCapacityAvailable: number;
    readonly sources: readonly SourceSnapshot[];
    /** All visible structures in the room, including spawns, towers, roads and walls. */
    readonly structures: readonly StructureSnapshot[];
    readonly constructionSites: readonly ConstructionSiteSnapshot[];
    readonly ruins: readonly RuinSnapshot[];
    /**
     * My creeps physically in this room this tick, from any base. This is about location only:
     * a task's creeps come from grouping `Game.creeps` by `memory.taskName`, not from this list.
     */
    readonly creepsPresent: readonly MyCreepSnapshot[];
    readonly hostileCreeps: readonly HostileCreepSnapshot[];
}
