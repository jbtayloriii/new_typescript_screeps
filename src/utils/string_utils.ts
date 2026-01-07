import { BasePlanningCoordinateString, Coordinate, CoordinateString } from "global_types";


export function CoordinateStringToCoordinate(coord: CoordinateString): { x: number, y: number } {
    try {
        let parts = coord.split("_");
        return { x: parseInt(parts[0]), y: parseInt(parts[1]) };
    }
}

export function CoordinateToCoordString(coordinate: { x: number, y: number }): CoordinateString {
    return `${coordinate.x}_${coordinate.y}`;
}

/** Converts a room position and structure type to a string for base planning. */
export function PositionToBasePlan(pos: RoomPosition | Coordinate, structure: BuildableStructureConstant): BasePlanningCoordinateString {
    return `${pos.x}_${pos.y}_${structure}`;
}
