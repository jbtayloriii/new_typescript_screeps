// Copied from https://github.com/screeps/driver/blob/master/native/src/pf.h
// Credit to Marcel Laverdet <https://github.com/laverdet>

import { MapPosition } from "./map_position";
import { Direction } from "./types";

/** Encapsulates a single point on the world map. */
export class WorldPosition {
    public readonly xx: number;
    public readonly yy: number;

    constructor(xx: number, yy: number) {
        this.xx = xx;
        this.yy = yy;
    }


    /** Returns a unique identifier for the given world position. 
     * 
     * Different WorldPosition instances at the same coordinates will return the same ID.
     * 
     * @returns An ID consisting of a 32 bit number split into 16 high bits for the 'xx' coordinate
     *   and 16 low bits for the 'yy' coordinate.
     */
    public getId(): number {
        return ((0xffff & this.xx) << 16) | this.yy;
    }

    // Returns a new WorldPosition in the given direction relative to this object.
    public worldPositionInDirection(direction: Direction): WorldPosition {
        switch (direction) {
            case Direction.TOP:
                return new WorldPosition(this.xx, this.yy - 1);
            case Direction.TOP_RIGHT:
                return new WorldPosition(this.xx + 1, this.yy - 1);
            case Direction.RIGHT:
                return new WorldPosition(this.xx + 1, this.yy);
            case Direction.BOTTOM_RIGHT:
                return new WorldPosition(this.xx + 1, this.yy + 1);
            case Direction.BOTTOM:
                return new WorldPosition(this.xx, this.yy + 1);
            case Direction.BOTTOM_LEFT:
                return new WorldPosition(this.xx - 1, this.yy + 1);
            case Direction.LEFT:
                return new WorldPosition(this.xx - 1, this.yy);
            case Direction.TOP_LEFT:
                return new WorldPosition(this.xx - 1, this.yy - 1);
        }
    }

    /** Returns the direction that would move this position closest towards another WorldPosition. */
    public getDirectionTo(other: WorldPosition): Direction {
        const dx = other.xx - this.xx;
        const dy = other.yy - this.yy;

        if (dx > 0) {
            if (dy > 0) {
                return BOTTOM_RIGHT;
            } else if (dy < 0) {
                return TOP_RIGHT;
            } else {
                return RIGHT;
            }
        } else if (dx < 0) {
            if (dy > 0) {
                return BOTTOM_LEFT;
            } else if (dy < 0) {
                return TOP_LEFT;
            } else {
                return LEFT;
            }
        } else {
            if (dy > 0) {
                return BOTTOM;
            } else if (dy < 0) {
                return TOP;
            }
        }
        throw new Error(`Unable to determine direction from ${this} to ${other}.`);
    }

    /** Returns the 8-degree minimum distance to reach another WorldPosition. */
    public getRangeTo(other: WorldPosition): number {
        return Math.max(Math.abs(this.xx - other.xx), Math.abs(this.yy - other.yy));
    }

    /** Returns the MapPosition cooresponding to this WorldPosition. */
    public getMapPosition(): MapPosition {
        return new MapPosition(
            Math.trunc(this.xx / 50),
            Math.trunc(this.yy / 50)
        );
    }
}
