import { describe, expect, test } from '@jest/globals';
import { PriorityQueue } from './priority_queue';

describe('Basic checks', () => {
    test('isEmpty() is true in empty queue', () => {
        const queue = new PriorityQueue<number>();
        expect(queue.isEmpty()).toBe(true);
    });

    test('pop() is undefined in empty queue', () => {
        const queue = new PriorityQueue<number>();
        expect(queue.pop()).toBe(undefined);
    });

    test('Repeated getPriority() calls are same', () => {
        const queue = new PriorityQueue<number>();
        queue.insert(/* index= */ 67, /* priority= */ 400);

        expect(queue.getPriority(/* index= */ 67)).toBe(400);
        expect(queue.getPriority(/* index= */ 67)).toBe(400);
        expect(queue.getPriority(/* index= */ 67)).toBe(400);

        expect(queue.getPriority(/* index= */ 68)).toBe(undefined);
        expect(queue.getPriority(/* index= */ 68)).toBe(undefined);
        expect(queue.getPriority(/* index= */ 68)).toBe(undefined);
    });
});

describe('Inserting', () => {
    test('Inserting 3 items pops items in priority order', () => {
        const queue = new PriorityQueue<number>();
        queue.insert(/* index= */ 1, /* priority= */ 10);
        queue.insert(/* index= */ 2, /* priority= */ 50);
        queue.insert(/* index= */ 3, /* priority= */ 30);

        expect(queue.pop()).toStrictEqual({ index: 1, priority: 10 });
        expect(queue.pop()).toStrictEqual({ index: 3, priority: 30 });
        expect(queue.pop()).toStrictEqual({ index: 2, priority: 50 });

        expect(queue.isEmpty()).toBe(true);
    });

    test('isEmpty() is false after insert', () => {
        const queue = new PriorityQueue<number>();
        queue.insert(/* index= */ 3, /* priority= */ 30);

        expect(queue.isEmpty()).toBe(false);
    });

    test('Inserting and clear returns empty queue', () => {
        const queue = new PriorityQueue<number>();
        queue.insert(/* index= */ 1, /* priority= */ 10);
        queue.insert(/* index= */ 2, /* priority= */ 50);

        expect(queue.isEmpty()).toBe(false);
        expect(queue.getPriority(/* index= */ 1)).toBe(10);
        expect(queue.getPriority(/* index= */ 2)).toBe(50);

        queue.clear();

        expect(queue.isEmpty()).toBe(true);
        expect(queue.getPriority(/* index= */ 1)).toBe(undefined);
        expect(queue.getPriority(/* index= */ 2)).toBe(undefined);
    });
});

describe('Changing priority', () => {
    test('Updating to higher priority does not affect nodes', () => {
        const queue = new PriorityQueue<number>();
        queue.insert(/* index= */ 1, /* priority= */ 10);
        queue.insert(/* index= */ 2, /* priority= */ 50);
        queue.insert(/* index= */ 3, /* priority= */ 30);

        // Node priority is updated to higher values, should not see change in queue
        queue.update(/* index= */ 2, /* priority= */ 75);
        queue.update(/* index= */ 1, /* priority= */ 15);

        expect(queue.pop()).toStrictEqual({ index: 1, priority: 10 });
        expect(queue.pop()).toStrictEqual({ index: 3, priority: 30 });
        expect(queue.pop()).toStrictEqual({ index: 2, priority: 50 });

        expect(queue.isEmpty()).toBe(true);
    });

    test('Updating priority with changing priority order affects pop() order', () => {
        const queue = new PriorityQueue<number>();
        queue.insert(/* index= */ 99, /* priority= */ 10);
        queue.insert(/* index= */ 55, /* priority= */ 50);
        queue.insert(/* index= */ 77, /* priority= */ 30);

        // Node priority is updated to lower values, and pop() order changes
        queue.update(/* index= */ 55, /* priority= */ 20);

        expect(queue.pop()).toStrictEqual({ index: 99, priority: 10 });
        expect(queue.pop()).toStrictEqual({ index: 55, priority: 20 });
        expect(queue.pop()).toStrictEqual({ index: 77, priority: 30 });

        expect(queue.isEmpty()).toBe(true);
    });

    test('Updating priority with not changing priority order does not affect pop() order', () => {
        const queue = new PriorityQueue<number>();
        queue.insert(/* index= */ 321, /* priority= */ 100);
        queue.insert(/* index= */ 432, /* priority= */ 500);
        queue.insert(/* index= */ 543, /* priority= */ 300);

        // Node priorities are updated to lower values, but pop order stays same
        queue.update(/* index= */ 432, /* priority= */ 450);
        queue.update(/* index= */ 543, /* priority= */ 150);

        expect(queue.pop()).toStrictEqual({ index: 321, priority: 100 });
        expect(queue.pop()).toStrictEqual({ index: 543, priority: 150 });
        expect(queue.pop()).toStrictEqual({ index: 432, priority: 450 });

        expect(queue.isEmpty()).toBe(true);
    });
});
