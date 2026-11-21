/**
 * Numbered Memory migrations.
 *
 * To change the Memory schema, append a migration with the next version number that converts
 * memory from the previous version. Migrations run in order on global reset, and each one runs
 * exactly once per Memory. Never edit or reorder a migration that has been deployed.
 */

export interface Migration {
    readonly version: number;
    readonly description: string;
    readonly migrate: (memory: Memory) => void;
}

/** Version string used before numbered migrations. Memory at this version is already clean. */
const LEGACY_CLEAN_VERSION = "2.5";

export const MIGRATIONS: readonly Migration[] = [
    {
        version: 1,
        description: "Switch from string versions to numbered migrations; clean up data from before 2.5.",
        migrate: (memory) => {
            const legacy = memory as unknown as Record<string, unknown>;
            if (legacy.currentMemoryVersion !== LEGACY_CLEAN_VERSION) {
                // Base layouts from older versions were stored as Maps and are empty; drop them so
                // they are recomputed when the base is created.
                delete legacy.bases_v3;
                // Task memory was never loaded back after a global reset, so anything stored is orphaned.
                delete legacy.tasks;
                for (const roomName in memory.rooms ?? {}) {
                    delete (memory.rooms[roomName] as unknown as Record<string, unknown>)._sourceToHarvestSpotMap;
                }
            }
            delete legacy.currentMemoryVersion;
        },
    },
    {
        version: 2,
        description: "Replace creep roles with tasks: reset creep memory to { taskName, baseRoomName }, "
            + "drop old task memory and power-harvesting memory.",
        migrate: (memory) => {
            for (const name in memory.creeps ?? {}) {
                const old = memory.creeps[name] as unknown as Record<string, unknown>;
                // An empty taskName makes every existing creep an orphan, so its base adopts it
                // into a task on the next tick.
                memory.creeps[name] = {
                    taskName: '',
                    baseRoomName: typeof old.owningRoomId === 'string' ? old.owningRoomId : '',
                };
            }
            const legacy = memory as unknown as Record<string, unknown>;
            // Old-format task memory (taskType/currentState) can't be read by the new tasks.
            legacy.tasks = {};
            delete legacy.sources;
            for (const roomName in memory.rooms ?? {}) {
                delete (memory.rooms[roomName] as unknown as Record<string, unknown>).powerHarvestingMap;
            }
        },
    },
];

export const CURRENT_MEMORY_VERSION: number = MIGRATIONS[MIGRATIONS.length - 1].version;

export function needsMigration(memory: Memory): boolean {
    return memory.memoryVersion !== CURRENT_MEMORY_VERSION;
}

/**
 * Runs all migrations newer than the memory's version, then fills in any missing top-level
 * fields. Safe to call repeatedly. Returns the versions that were applied.
 */
export function migrateMemory(memory: Memory, migrations: readonly Migration[] = MIGRATIONS): number[] {
    const applied: number[] = [];
    const startVersion = memory.memoryVersion ?? 0;
    for (const migration of migrations) {
        if (migration.version > startVersion) {
            migration.migrate(memory);
            memory.memoryVersion = migration.version;
            applied.push(migration.version);
        }
    }
    initializeDefaults(memory);
    return applied;
}

function initializeDefaults(memory: Memory): void {
    memory.memoryVersion ??= CURRENT_MEMORY_VERSION;
    memory.creeps ??= {};
    memory.rooms ??= {};
    memory.bases_v3 ??= {};
    memory.tasks ??= {};
    memory.nextTaskId ??= 0;
    memory.intel ??= {};
    memory.log ??= {
        lastReportedDate: -1,
        infoMessages: [],
        warningMessages: [],
    };
}
