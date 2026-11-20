import { describe, expect, test } from '@jest/globals';
import { removeDeadCreepMemory } from './creep_memory';
import { createTestMemory } from 'testing/memory';

describe('removeDeadCreepMemory', () => {
    test('deletes memory of creeps that no longer exist', () => {
        const memory = createTestMemory();
        memory.creeps = {
            alive: { taskName: 't', baseRoomName: 'W1N1' },
            dead: { taskName: 't', baseRoomName: 'W1N1' },
        };
        expect(removeDeadCreepMemory(memory, new Set(['alive']))).toEqual(['dead']);
        expect(Object.keys(memory.creeps)).toEqual(['alive']);
    });
});
