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
    const migration1 = MIGRATIONS.slice(0, 1);

    test('keeps data from legacy version 2.5', () => {
        const memory = {
            currentMemoryVersion: '2.5',
            bases_v3: { W1N1: { currentControllerLevelPlan: 2 } },
            tasks: { W1N1: [] },
        } as unknown as Memory;

        migrateMemory(memory, migration1);

        expect(memory.bases_v3).toEqual({ W1N1: { currentControllerLevelPlan: 2 } });
        expect(memory).not.toHaveProperty('currentMemoryVersion');
    });

    test('drops broken layouts, orphaned tasks and harvest spot maps from before 2.5', () => {
        const memory = {
            currentMemoryVersion: '2.4',
            bases_v3: { W1N1: { baseLayout: {} } },
            tasks: { W1N1: [{ name: 'W1N1_1_0' }] },
            rooms: { W1N1: { _sourceToHarvestSpotMap: {}, other: 1 } },
            sources: { abc: { id: 'abc' } },
        } as unknown as Memory;

        migrateMemory(memory, migration1);

        expect(memory.bases_v3).toEqual({});
        expect(memory.tasks).toEqual({});
        expect(memory.rooms.W1N1).toEqual({ other: 1 });
        expect(memory).toHaveProperty('sources', { abc: { id: 'abc' } });
        expect(memory).not.toHaveProperty('currentMemoryVersion');
    });
});

describe('migration 2 (roles to tasks)', () => {
    function memoryAtVersion1(extra: object): Memory {
        return { ...createTestMemory(), memoryVersion: 1, ...extra } as Memory;
    }

    test('turns role creeps into orphans of their base', () => {
        const memory = memoryAtVersion1({
            creeps: {
                h1: { owningRoomId: 'W1N1', creepType: 0, taskName: 'TODO: remove', currentState: 1, links: {} },
                lost: { creepType: 2 },
            },
        });

        migrateMemory(memory);

        expect(memory.creeps).toEqual({
            h1: { taskName: '', baseRoomName: 'W1N1' },
            lost: { taskName: '', baseRoomName: '' },
        });
    });

    test('drops old tasks, sources and power-harvesting memory', () => {
        const memory = memoryAtVersion1({
            tasks: { W1N1: [{ name: 'old', taskType: 1, currentState: 0 }] },
            sources: { abc: {} },
            rooms: { W1N1: { powerHarvestingMap: {} } },
        });

        migrateMemory(memory, MIGRATIONS.slice(0, 2));

        expect(memory.tasks).toEqual({});
        expect(memory).not.toHaveProperty('sources');
        expect(memory.rooms.W1N1).toEqual({});
        expect(memory.memoryVersion).toBe(2);
    });
});

describe('migration 3 (directives)', () => {
    test('links existing remote mine tasks to new automatic directives', () => {
        const memory = { ...createTestMemory(), memoryVersion: 2 } as Memory;
        delete (memory as Partial<Memory>).directives;
        memory.tasks = {
            W1N1: [
                { name: 'rm', roomName: 'W1N1', type: 'remoteMine', targetRoom: 'W1N2' },
                { name: 'u', roomName: 'W1N1', type: 'upgrade' },
            ],
        };

        migrateMemory(memory);

        expect(memory.directives).toEqual({
            d0: { id: 'd0', type: 'remoteMine', targetRoom: 'W1N2', source: 'auto', status: 'active', createdAt: 0, baseRoomName: 'W1N1' },
        });
        expect(memory.tasks.W1N1[0]).toMatchObject({ directiveId: 'd0' });
        expect(memory.nextDirectiveId).toBe(1);
    });
});

