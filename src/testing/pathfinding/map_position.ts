
/** Class that stores World coordinates of a single room on the global map.
 * 
 * For example, E1N1 on a map of size 255 translates to MapPosition {xx: 129, yy: 126}.
 */

const WORLD_SIZE = 255;

export class MapPosition {
    public readonly xx: number;
    public readonly yy: number;

    constructor(xx: number, yy: number) {
        this.xx = xx;
        this.yy = yy;
    }

    /** Returns a unique identifier for the given map position. 
     * 
     * Different MapPosition instances at the same coordinates will return the same ID.
     * 
     * @returns An ID consisting of a 32 bit number split into 16 high bits for the 'xx' coordinate
     *   and 16 low bits for the 'yy' coordinate.
     */
    public getId(): number {
        return ((0xffff & this.xx) << 16) | this.yy;
    }

    public toRoomName(): string {
        return (
            (this.xx <= WORLD_SIZE >> 1 ? 'W' + ((WORLD_SIZE >> 1) - this.xx) : 'E' + (this.xx - (WORLD_SIZE >> 1) - 1)) +
            (this.yy <= WORLD_SIZE >> 1 ? 'N' + ((WORLD_SIZE >> 1) - this.yy) : 'S' + (this.yy - (WORLD_SIZE >> 1) - 1))
        );
    }
}
