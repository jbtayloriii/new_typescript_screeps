import {
    ConstructionSiteSnapshot,
    ControllerSnapshot,
    HostileCreepSnapshot,
    MyCreepSnapshot,
    Pos,
    RoomSnapshot,
    SourceSnapshot,
    StructureSnapshot,
} from "snapshot/types";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

let nextId = 0;
function newId<T extends _HasId>(prefix: string): Id<T> {
    return `${prefix}${nextId++}` as Id<T>;
}

/**
 * Fluent builder for RoomSnapshots in tests. Everything has sensible defaults, so a test only
 * sets what it cares about:
 *
 *   const room = aRoom().withRcl(3).withTower(25, 25, { energy: 500 }).withHostile(30, 30).build();
 *
 * Each `with*` method takes optional overrides for any snapshot field.
 */
export function aRoom(name: RoomName = 'W1N1'): RoomSnapshotBuilder {
    return new RoomSnapshotBuilder(name);
}

export class RoomSnapshotBuilder {
    private readonly snapshot: Mutable<RoomSnapshot> & {
        sources: SourceSnapshot[];
        structures: StructureSnapshot[];
        constructionSites: ConstructionSiteSnapshot[];
        creepsPresent: MyCreepSnapshot[];
        hostileCreeps: HostileCreepSnapshot[];
    };

    constructor(name: RoomName) {
        this.snapshot = {
            name,
            tick: 1,
            controller: null,
            energyAvailable: 300,
            energyCapacityAvailable: 300,
            sources: [],
            structures: [],
            constructionSites: [],
            creepsPresent: [],
            hostileCreeps: [],
        };
    }

    private pos(x: number, y: number): Pos {
        return { x, y, roomName: this.snapshot.name };
    }

    withTick(tick: number): this {
        this.snapshot.tick = tick;
        return this;
    }

    withEnergy(available: number, capacity: number = available): this {
        this.snapshot.energyAvailable = available;
        this.snapshot.energyCapacityAvailable = capacity;
        return this;
    }

    /** Adds an owned controller at the given level. */
    withRcl(level: number, overrides: Partial<ControllerSnapshot> = {}): this {
        this.snapshot.controller = {
            id: newId('controller'),
            pos: this.pos(25, 25),
            my: true,
            level,
            progress: 0,
            progressTotal: 1000,
            ticksToDowngrade: 20000,
            ...overrides,
        };
        return this;
    }

    withSource(x: number, y: number, overrides: Partial<SourceSnapshot> = {}): this {
        this.snapshot.sources.push({
            id: newId('source'),
            pos: this.pos(x, y),
            energy: 3000,
            energyCapacity: 3000,
            ...overrides,
        });
        return this;
    }

    /** Adds a structure. Owned (`owner: 'me'`) at full hits by default. */
    withStructure(structureType: StructureConstant, x: number, y: number, overrides: Partial<StructureSnapshot> = {}): this {
        this.snapshot.structures.push({
            id: newId(structureType),
            structureType,
            pos: this.pos(x, y),
            hits: 1000,
            hitsMax: 1000,
            owner: 'me',
            ...overrides,
        });
        return this;
    }

    withSpawn(x: number, y: number, opts: { spawning?: boolean, energy?: number } & Partial<StructureSnapshot> = {}): this {
        const { spawning = false, energy = 300, ...overrides } = opts;
        return this.withStructure(STRUCTURE_SPAWN, x, y, {
            spawning,
            store: { energy, energyCapacity: 300 },
            ...overrides,
        });
    }

    withTower(x: number, y: number, opts: { energy?: number } & Partial<StructureSnapshot> = {}): this {
        const { energy = 1000, ...overrides } = opts;
        return this.withStructure(STRUCTURE_TOWER, x, y, {
            store: { energy, energyCapacity: 1000 },
            ...overrides,
        });
    }

    withConstructionSite(structureType: BuildableStructureConstant, x: number, y: number, overrides: Partial<ConstructionSiteSnapshot> = {}): this {
        this.snapshot.constructionSites.push({
            id: newId('site'),
            structureType,
            pos: this.pos(x, y),
            progress: 0,
            progressTotal: 1000,
            ...overrides,
        });
        return this;
    }

    withMyCreep(name: string, x: number, y: number, overrides: Partial<MyCreepSnapshot> = {}): this {
        this.snapshot.creepsPresent.push({
            id: newId('creep'),
            name,
            pos: this.pos(x, y),
            hits: 300,
            hitsMax: 300,
            activeParts: { [WORK]: 1, [CARRY]: 1, [MOVE]: 1 },
            store: { energy: 0, energyCapacity: 50 },
            spawning: false,
            ticksToLive: 1500,
            memory: {} as CreepMemory,
            ...overrides,
        });
        return this;
    }

    withHostile(x: number, y: number, overrides: Partial<HostileCreepSnapshot> = {}): this {
        this.snapshot.hostileCreeps.push({
            id: newId('hostile'),
            name: `hostile${nextId}`,
            pos: this.pos(x, y),
            hits: 300,
            hitsMax: 300,
            activeParts: { [ATTACK]: 1, [MOVE]: 1 },
            store: { energy: 0, energyCapacity: 0 },
            spawning: false,
            ticksToLive: 1500,
            owner: 'Invader',
            ...overrides,
        });
        return this;
    }

    build(): RoomSnapshot {
        return {
            ...this.snapshot,
            sources: [...this.snapshot.sources],
            structures: [...this.snapshot.structures],
            constructionSites: [...this.snapshot.constructionSites],
            creepsPresent: [...this.snapshot.creepsPresent],
            hostileCreeps: [...this.snapshot.hostileCreeps],
        };
    }
}
