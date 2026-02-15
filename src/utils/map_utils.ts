import { BaseLayoutMap, Coordinate } from "global_types";
import { basePlanCoordToSymbolObj } from "./string_utils";


export function baseMapToString(baseMap: BaseLayoutMap, walls: Coordinate[], sources: Source[], mapSize: number, level: number = 8): string {
    if (level < 1 || level > 8) {
        throw new Error(`Cannot convert base map to string at level ${level}`);
    }

    let baseArr = Array.from({ length: mapSize }, () => Array(mapSize).fill('.'));

    walls.forEach(w => baseArr[w.y][w.x] = 1);

    sources.forEach(s => baseArr[s.pos.y][s.pos.x] = 'S');

    baseMap.forEach((layoutCoords, lvl) => {
        if (lvl > level) {
            return;
        }
        layoutCoords.forEach(c => {

            const layout = basePlanCoordToSymbolObj(c);
            baseArr[layout.coord.y][layout.coord.x] = layout.symbol;
        });
    });

    return baseArr.map(row => row.join('')).join('\n');
}
