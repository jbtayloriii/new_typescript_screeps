import { describe, expect, test } from '@jest/globals';
import { TaskStore } from './task_store';
import { createTestMemory } from 'testing/memory';

describe('TaskStore', () => {
    test('creates tasks with unique names that are never reused', () => {
        const memory = createTestMemory();
        const store = new TaskStore(memory);

        const first = store.createTask('W1N1', { type: 'upgrade' });
        store.removeTask('W1N1', first.name);
        const second = store.createTask('W1N1', { type: 'upgrade' });

        expect(first).toEqual({ type: 'upgrade', name: 'W1N1_upgrade_0', roomName: 'W1N1' });
        expect(second.name).toBe('W1N1_upgrade_1');
        expect(memory.tasks['W1N1']).toEqual([second]);
    });

    test('keeps tasks per room', () => {
        const store = new TaskStore(createTestMemory());
        store.createTask('W1N1', { type: 'repair' });
        store.createTask('W2N2', { type: 'build' });

        expect(store.getTasks('W1N1').map(t => t.type)).toEqual(['repair']);
        expect(store.getTasks('W2N2').map(t => t.type)).toEqual(['build']);
        expect(store.getTasks('W3N3')).toEqual([]);
    });

    test('removeTask reports whether the task existed', () => {
        const store = new TaskStore(createTestMemory());
        const task = store.createTask('W1N1', { type: 'repair' });
        expect(store.removeTask('W1N1', task.name)).toBe(true);
        expect(store.removeTask('W1N1', task.name)).toBe(false);
        expect(store.removeTask('W9N9', task.name)).toBe(false);
    });
});
