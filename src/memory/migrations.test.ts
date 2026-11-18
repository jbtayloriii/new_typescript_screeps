import { describe, expect, test } from '@jest/globals';
import { CURRENT_MEMORY_VERSION, migrateMemory, Migration, MIGRATIONS, needsMigration } from './migrations';
import { createTestMemory } from 'testing/memory';

describe('MIGRATIONS', () => {
    test('versions start at 1 and increase by 1', () => {
        MIGRATIONS.forEach((m, i) => expect(m.version).toBe(i + 1));
    });
});

describe('migrateMemory', () => {
    test('initializes empty memory to the current version', () => {
        const memory = {} as Memory;
        migrateMemory(memory);

        expect(memory.memoryVersion).toBe(CURRENT_MEMORY_VERSION);
        expect(memory.bases_v3).toEqual({});
        expect(memory.sources).toEqual({});
        expect(memory.tasks).toEqual({});
        expect(memory.nextTaskId).toBe(0);
        expect(memory.log.infoMessages).toEqual([]);
        expect(needsMigration(memory)).toBe(false);
    });

    test('is a no-op at the current version', () => {
        const memory = createTestMemory();
        memory.bases_v3['W1N1'] = { currentControllerLevelPlan: 3 } as BaseMemory;
        memory.nextTaskId = 7;

        expect(migrateMemory(memory)).toEqual([]);
        expect(memory.bases_v3['W1N1'].currentControllerLevelPlan).toBe(3);
        expect(memory.nextTaskId).toBe(7);
    });

    test('only runs migrations newer than the memory version, in order', () => {
        const ran: number[] = [];
        const migrations: Migration[] = [1, 2, 3].map(version => ({
            version, description: '', migrate: () => { ran.push(version); },
        }));
        const memory = { memoryVersion: 1 } as Memory;

        expect(migrateMemory(memory, migrations)).toEqual([2, 3]);
        expect(ran).toEqual([2, 3]);
        expect(memory.memoryVersion).toBe(3);
    });

    test('memory survives a JSON round trip unchanged', () => {
        const memory = createTestMemory();
        expect(JSON.parse(JSON.stringify(memory))).toEqual(memory);
    });
});

describe('migration 1 (legacy string versions)', () => {
    test('keeps data from legacy version 2.5', () => {
        const memory = {
            currentMemoryVersion: '2.5',
            bases_v3: { W1N1: { currentControllerLevelPlan: 2 } },
            tasks: { W1N1: [] },
        } as unknown as Memory;

        migrateMemory(memory);

        expect(memory.bases_v3).toEqual({ W1N1: { currentControllerLevelPlan: 2 } });
        expect(memory).not.toHaveProperty('currentMemoryVersion');
    });

    test('drops broken layouts, orphaned tasks and harvest spot maps from before 2.5', () => {
        const memory = {
            currentMemoryVersion: '2.4',
            bases_v3: { W1N1: { baseLayout: {} } },
            tasks: { W1N1: [{ name: 'W1N1_1_0' }] },
            rooms: { W1N1: { _sourceToHarvestSpotMap: {}, powerHarvestingMap: {} } },
            sources: { abc: { id: 'abc' } },
        } as unknown as Memory;

        migrateMemory(memory);

        expect(memory.bases_v3).toEqual({});
        expect(memory.tasks).toEqual({});
        expect(memory.rooms.W1N1).toEqual({ powerHarvestingMap: {} });
        expect(Object.keys(memory.sources)).toEqual(['abc']);
        expect(memory).not.toHaveProperty('currentMemoryVersion');
    });
});
