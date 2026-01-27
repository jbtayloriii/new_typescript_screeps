
// From https://github.com/screeps/engine/blob/master/src/game/path-finder.js
export class PfCostMatrix {
    public _bits: Uint8Array;

    constructor() {
        this._bits = new Uint8Array(2500);
    }

    public set(xx: number, yy: number, val: number): void {
        xx = xx | 0;
        yy = yy | 0;
        this._bits[xx * 50 + yy] = Math.min(Math.max(0, val), 255);
    }

    public get(xx: number, yy: number): number | undefined {
        xx = xx | 0;
        yy = yy | 0;
        return this._bits[xx * 50 + yy];
    }

    public clone(): PfCostMatrix {
        var newMatrix = new PfCostMatrix();
        newMatrix._bits = new Uint8Array(this._bits);
        return newMatrix;
    }

    public serialize(): number[] {
        return Array.prototype.slice.apply(new Uint32Array(this._bits.buffer));
    }

    public deserialize(data: number[]): CostMatrix {
        let instance = Object.create(PfCostMatrix.prototype);
        instance._bits = new Uint8Array(new Uint32Array(data).buffer);
        return instance;
    }
}
