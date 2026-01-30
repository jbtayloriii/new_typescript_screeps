

export class PriorityQueue<IndexType extends number> {
    private priorities = new Map<IndexType, number>();
    private heap: IndexType[] = [];
    private size: number = 0;

    constructor() { }

    /** Returns true iff there are no elements in the priority queue. */
    isEmpty(): boolean {
        return this.size === 0;
    }

    /** Returns the priority for a given index, or undefined if the index is not in the queue. */
    getPriority(index: IndexType): number | undefined {
        return this.priorities.get(index);
    }

    getSize(): number {
        return this.size;
    }

    /** Removes the top element from the queue and returns it and its priority. */
    pop(): { index: IndexType, priority: number } | undefined {
        if (this.isEmpty()) {
            return undefined;
        }

        // Get top value from the heap before bubbling
        const retIndex = this.heap[1];
        const retPriority = this.priorities.get(retIndex);
        if (retPriority === undefined) {
            throw new Error(`Got an undefined priority for index ${retIndex}`);
        }
        const ret = {
            index: retIndex,
            priority: retPriority,
        }

        this.heap[1] = this.heap[this.size];
        this.size -= 1;

        let vv: number = 1;
        do {
            const uu: number = vv;

            if ((uu << 1) + 1 <= this.size) {
                // Left and right children are in heap

                // Compare with left child, swap if left child priority is lower
                if (this.priorities.get(this.heap[uu])! >= this.priorities.get(this.heap[uu << 1])!) {
                    vv = uu << 1;
                }

                // Compare with right child, swap if right child priority is lower
                if (this.priorities.get(this.heap[vv])! >= this.priorities.get(this.heap[(uu << 1) + 1])!) {
                    vv = (uu << 1) + 1;
                }
            } else if (uu << 1 <= this.size) {
                // Only left child is available

                // Compare with left child, swap if left child priority is lower
                if (this.priorities.get(this.heap[uu])! >= this.priorities.get(this.heap[uu << 1])!) {
                    vv = uu << 1;
                }
            }

            if (uu === vv) {
                break;
            } else {
                const temp = this.heap[uu];
                this.heap[uu] = this.heap[vv];
                this.heap[vv] = temp;
            }

        } while (true);

        return ret;
    }

    insert(index: IndexType, priority: number): void {
        this.priorities.set(index, priority);
        this.size += 1;
        this.heap[this.size] = index;
        this.bubbleUp(this.size);
    }

    update(index: IndexType, priority: number): void {
        for (let ii = this.size; ii > 0; ii--) {
            if (this.heap[ii] == index) {
                // Only update if the new priority is lower
                if (this.priorities.get(index)! <= priority) {
                    return;
                }

                this.priorities.set(index, priority);
                this.bubbleUp(ii);
                return;
            }
        }
    }

    clear(): void {
        this.priorities = new Map();
        this.heap = [];
        this.size = 0;
    }

    /** Bubbles a newly inserted or updated node to a valid position in the heap. */
    private bubbleUp(ii: number): void {
        while (ii !== 1) {
            if (this.priorities.get(this.heap[ii])! <= this.priorities.get(this.heap[ii >> 1])!) {
                // Swap node with its parent, it is lower priority
                const temp = this.heap[ii];
                this.heap[ii] = this.heap[ii >> 1];
                this.heap[ii >> 1] = temp;
                ii = ii >> 1;
            } else {
                return;
            }
        }
    }
}
