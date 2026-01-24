
/**  Set that allows storing values in either an 'open' or 'closed' setting. */
export class OpenClosedSet {
    // Holds true for open, false for closed. Values not in the Map
    // are neither open nor closed.
    private indexOpenMap: Map<Number, boolean> = new Map();

    constructor() { }

    /** Removes all open and closed values in the set. */
    clear(): void {
        this.indexOpenMap.clear();
    }

    /** Returns true iff `index` has been inserted in the set as an open value. */
    isOpen(index: number): boolean {
        const val = this.indexOpenMap.get(index);
        if (val === undefined) {
            return false;
        }

        // isOpen when val === true
        return val;
    }

    /** Returns true iff `index` has been inserted in the set as a closed value. */
    isClosed(index: number): boolean {
        const val = this.indexOpenMap.get(index);
        if (val === undefined) {
            return false;
        }

        // isClosed when val === false
        return !val;

    }

    /** Adds a new value to the set as an 'open' value. 
     * 
     * If the index already exists in the set, this updates it to be 'open'.
     */
    open(index: number): void {
        this.indexOpenMap.set(index, true);
    }

    /** Adds a new value to the set as a 'closed' value.
     * 
     * If the index already exists in the set, this updates it to be 'closed'.
     */
    close(index: number): void {
        this.indexOpenMap.set(index, false);
    }
}
