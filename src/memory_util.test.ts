import { describe, expect, test } from '@jest/globals';
import { CURRENT_MEMORY_VERSION, migrateMemory } from './memory_util';

function emptyMemory(): Memory {
  return {} as Memory;
}

describe('migrateMemory', () => {
  test('initializes all top-level fields on empty memory', () => {
    const memory = emptyMemory();
    migrateMemory(memory);

    expect(memory.bases_v3).toEqual({});
    expect(memory.sources).toEqual({});
    expect(memory.tasks).toEqual({});
    expect(memory.nextTaskId).toBe(0);
    expect(memory.log.infoMessages).toEqual([]);
    expect(memory.currentMemoryVersion).toBe(CURRENT_MEMORY_VERSION);
  });

  test('drops broken base layouts, orphaned tasks and harvest spot maps from older versions', () => {
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
    // Unrelated memory is kept
    expect(Object.keys(memory.sources)).toEqual(['abc']);
  });

  test('keeps existing data when already at the current version', () => {
    const memory = emptyMemory();
    migrateMemory(memory);
    memory.bases_v3['W1N1'] = { currentControllerLevelPlan: 3 } as BaseMemory;
    memory.nextTaskId = 7;

    migrateMemory(memory);

    expect(memory.bases_v3['W1N1'].currentControllerLevelPlan).toBe(3);
    expect(memory.nextTaskId).toBe(7);
  });

  test('survives a JSON round trip unchanged', () => {
    const memory = emptyMemory();
    migrateMemory(memory);
    expect(JSON.parse(JSON.stringify(memory))).toEqual(memory);
  });
});
