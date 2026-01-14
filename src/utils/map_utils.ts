import { BaseLayoutMap, Coordinate } from "global_types";

const StructureSymbol: Record<string, string> = {
    road: 'r',
    extension: '☉',
    spawn: 's',
    tower: 't',
    storage: '🫙',
    link: 'l',
    nuker: 'n',
    rampart: 'R',
    terminal: '$',
    factory: 'f',
}

export function typeToSymbol(buildingtype: string): string {
    if (StructureSymbol.hasOwnProperty(buildingtype)) {
        const v: any = StructureSymbol[buildingtype];
        if (typeof v === 'string') {
            return v;
        }
    }
    throw new Error(`Unable to convert ${buildingtype} to symbol.`);
}


export function baseMapToString(baseMap: BaseLayoutMap, walls: Coordinate[], mapSize: number, level: number = 8): string {
    if (level < 1 || level > 8) {
        throw new Error(`Cannot convert base map to string at level ${level}`);
    }

    let baseArr = Array.from({ length: mapSize }, () => Array(mapSize).fill('.'));

    walls.forEach(w => baseArr[w.y][w.x] = 1);

    baseMap.forEach((layoutCoords, lvl) => {
        if (lvl > level) {
            return;
        }
        layoutCoords.forEach(c => {

            // TODO: convert to a util function
            const split = c.split('_');
            const x: number = Number(split[0]);
            const y: number = Number(split[1]);
            const buildingType: string = split[2];
            baseArr[y][x] = typeToSymbol(buildingType);
        });
    });

    return baseArr.map(row => row.join('')).join('\n');
}
