import { describe, expect, test } from '@jest/globals';
import { CANCELLED_DIRECTIVE_TTL, DirectiveStore, DONE_DIRECTIVE_TTL } from './store';
import { createTestMemory } from 'testing/memory';

describe('DirectiveStore', () => {
    test('adds directives with short ids, active only when given a base', () => {
        const store = new DirectiveStore(createTestMemory());
        const pending = store.add({ type: 'scout', targetRoom: 'W5N5', source: 'manual' }, 10);
        const active = store.add({ type: 'remoteMine', targetRoom: 'W1N2', source: 'auto', baseRoomName: 'W1N1' }, 10);

        expect(pending).toEqual({ type: 'scout', targetRoom: 'W5N5', source: 'manual', id: 'd0', status: 'pending', createdAt: 10 });
        expect(active).toMatchObject({ id: 'd1', status: 'active' });
    });

    test('updates (removing undefined keys), ends and prunes', () => {
        const memory = createTestMemory();
        const store = new DirectiveStore(memory);
        const done = store.add({ type: 'scout', targetRoom: 'W5N5', source: 'manual' }, 0);
        const cancelled = store.add({ type: 'scout', targetRoom: 'W6N6', source: 'manual' }, 0);
        store.update(done.id, { reason: 'waiting' });
        store.update(done.id, { reason: undefined });
        expect(store.get(done.id)).not.toHaveProperty('reason');

        store.end(done.id, 'done', 'scouted', 100);
        store.end(cancelled.id, 'cancelled', 'by hand', 100);
        store.prune(100 + DONE_DIRECTIVE_TTL + 1);
        expect(store.get(done.id)).toBeUndefined();
        expect(store.get(cancelled.id)).toMatchObject({ status: 'cancelled', endedAt: 100 });
        store.prune(100 + CANCELLED_DIRECTIVE_TTL + 1);
        expect(store.all()).toEqual([]);
    });

    test('applies planner changes', () => {
        const store = new DirectiveStore(createTestMemory());
        const d = store.add({ type: 'scout', targetRoom: 'W5N5', source: 'manual' }, 0);
        store.apply({
            create: [{ type: 'claim', targetRoom: 'W2N2', source: 'flag', flagName: 'f' }],
            update: [{ id: d.id, patch: { status: 'active', baseRoomName: 'W1N1' } }],
            end: [], intents: [], handoffs: [],
        }, 5);
        expect(store.get(d.id)).toMatchObject({ status: 'active', baseRoomName: 'W1N1' });
        expect(store.all().map(x => x.type)).toEqual(['scout', 'claim']);
    });
});
