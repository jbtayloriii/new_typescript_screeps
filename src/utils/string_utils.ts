import { BasePlanningCoordinateString, Coordinate, CoordinateString } from 'global_types';


// TODO: figure out easiest way to declare a hard-coded map and query against it.
const _STRUCTURE_CHAR_BY_STRUCTURE_CONSTANT: Map<BuildableStructureConstant, string> = new Map([
    [STRUCTURE_EXTENSION, 'x'],
    [STRUCTURE_RAMPART, 'R'],
    [STRUCTURE_ROAD, 'r'],
    [STRUCTURE_SPAWN, 's'],
    [STRUCTURE_LINK, 'l'],
    [STRUCTURE_WALL, 'w'],
    [STRUCTURE_STORAGE, 'T'],
    [STRUCTURE_TOWER, 't'],
    [STRUCTURE_OBSERVER, 'o'],
    [STRUCTURE_POWER_SPAWN, 'P'],
    [STRUCTURE_EXTRACTOR, 'X'],
    [STRUCTURE_LAB, 'L'],
    [STRUCTURE_TERMINAL, '$'],
    [STRUCTURE_CONTAINER, 'c'],
    [STRUCTURE_NUKER, 'N'],
    [STRUCTURE_FACTORY, 'F'],
]);

// Keys must be from BuildableStructureConstant
// const _STRUCTURE_CHAR_BY_STRUCTURE_CONSTANT: { [structureType: string]: string } = {
//     STRUCTURE_EXTENSION: 'x',
//     STRUCTURE_RAMPART: 'R',
//     STRUCTURE_ROAD: 'r',
//     STRUCTURE_SPAWN: 's',
//     STRUCTURE_LINK: 'l',
//     STRUCTURE_WALL: 'w',
//     STRUCTURE_STORAGE: 'T',
//     STRUCTURE_TOWER: 't',
//     STRUCTURE_OBSERVER: 'o',
//     STRUCTURE_POWER_SPAWN: 'P',
//     STRUCTURE_EXTRACTOR: 'X',
//     STRUCTURE_LAB: 'L',
//     STRUCTURE_TERMINAL: '$',
//     STRUCTURE_CONTAINER: 'c',
//     STRUCTURE_NUKER: 'N',
//     STRUCTURE_FACTORY: 'F',
// } as const;

const _REVERSE_SYMBOL_TO_STRUCTURE_MAPPING: { [symbol: string]: BuildableStructureConstant } = {
    'x': STRUCTURE_EXTENSION,
    'R': STRUCTURE_RAMPART,
    'r': STRUCTURE_ROAD,
    's': STRUCTURE_SPAWN,
    'l': STRUCTURE_LINK,
    'w': STRUCTURE_WALL,
    'T': STRUCTURE_STORAGE,
    't': STRUCTURE_TOWER,
    'o': STRUCTURE_OBSERVER,
    'P': STRUCTURE_POWER_SPAWN,
    'X': STRUCTURE_EXTRACTOR,
    'L': STRUCTURE_LAB,
    '$': STRUCTURE_TERMINAL,
    'c': STRUCTURE_CONTAINER,
    'N': STRUCTURE_NUKER,
    'F': STRUCTURE_FACTORY,
} as const;

export function buildableStructureToChar(buildableStructure: BuildableStructureConstant): string {
    if (_STRUCTURE_CHAR_BY_STRUCTURE_CONSTANT.has(buildableStructure)) {
        const v: any = _STRUCTURE_CHAR_BY_STRUCTURE_CONSTANT.get(buildableStructure);
        if (v !== undefined) {
            return v;
        }
    }
    console.log(_STRUCTURE_CHAR_BY_STRUCTURE_CONSTANT);
    throw new Error(`Unable to convert ${buildableStructure} to symbol.`);

}

export function coordinateStringToCoordinate(coord: CoordinateString): { x: number, y: number } {
    // TODO: better handling instead of parseInt
    let parts = coord.split('_');
    return { x: parseInt(parts[0]), y: parseInt(parts[1]) };
}

export function coordinateToCoordString(coordinate: { x: number, y: number }): CoordinateString {
    return `${coordinate.x}_${coordinate.y}`;
}

/** Converts a room position and structure type to a string for base planning. */
export function basePlanObjToBasePlanCoordString(pos: RoomPosition | Coordinate, structure: BuildableStructureConstant): BasePlanningCoordinateString {
    const buildingSymbol = buildableStructureToChar(structure);
    return `${pos.x}_${pos.y}_${buildingSymbol}`;
}

export function basePlanCoordToSymbolObj(str: BasePlanningCoordinateString): { coord: Coordinate, symbol: string } {
    const sections = str.split('_');
    const x = parseInt(sections[0]);
    const y = parseInt(sections[1]);
    const structureSymbol = sections[2];
    if (_REVERSE_SYMBOL_TO_STRUCTURE_MAPPING.hasOwnProperty(structureSymbol)) {
        return {
            coord: { x: x, y: y },
            symbol: structureSymbol,
        };
    }
    throw new Error(`Unable to convert base planning coordinate string ${str} to symbol obj`);

}

export function basePlanCoordToBuildingObj(str: BasePlanningCoordinateString): { coord: Coordinate, structure: BuildableStructureConstant } {
    const sections = str.split('_');
    const x = parseInt(sections[0]);
    const y = parseInt(sections[1]);
    const structureSymbol = sections[2];
    if (_REVERSE_SYMBOL_TO_STRUCTURE_MAPPING.hasOwnProperty(structureSymbol)) {
        const v: any = _REVERSE_SYMBOL_TO_STRUCTURE_MAPPING[structureSymbol];
        if (typeof v === 'string') {
            return {
                coord: { x: x, y: y },
                structure: v as BuildableStructureConstant,

            };
        }
    }
    throw new Error(`Unable to convert base planning coordinate string ${str} to building obj`);
}
