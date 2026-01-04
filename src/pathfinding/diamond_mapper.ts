/**
 * Module for performing mapping calculations for base planning.
 */

type Position = {
    x: number,
    y: number,
}

export type WeightedPosition = {
    x: number,
    y: number,
    v: number
}

const DEFAULT_MAP_SIZE = 50;

/** Returns a 2d array giving the orthogonal distance to walls or edges.
 * 
 *  The array is returned as map[y][x], top to bottom, left to right.
 * 
 *  This is used for making diamond stamps of radius R: 
 * 
 *  W12321W    W..D..W
 *  1234321    ..DDD..
 *  2345432 -> .DDDDD.
 *  1234321    ..DDD..
 *  W12321W    W..D..W
 */
export function getDiamondMapping(walls: Position[], mapSize: number = DEFAULT_MAP_SIZE): number[][] {
    let tileArr = Array.from({ length: mapSize }, () => Array(mapSize).fill(0));

    let queue: WeightedPosition[] = [];

    initializeEdges(tileArr, queue, mapSize);

    // Add walls and push values next to walls
    walls.forEach((row) => {
        tileArr[row.y][row.x] = -1;
        queue.push({ x: row.x + 1, y: row.y, v: 1 });
        queue.push({ x: row.x - 1, y: row.y, v: 1 });
        queue.push({ x: row.x, y: row.y + 1, v: 1 });
        queue.push({ x: row.x, y: row.y - 1, v: 1 });
    });

    // BFS
    while (queue.length > 0) {
        let nextVal = queue.shift()!;

        if (nextVal.x >= mapSize || nextVal.x < 0) {
            continue;
        }

        if (nextVal.y >= mapSize || nextVal.y < 0) {
            continue;
        }
        if (tileArr[nextVal.y][nextVal.x] != 0) {
            continue;
        }

        tileArr[nextVal.y][nextVal.x] = nextVal.v;
        queue.push({ x: nextVal.x + 1, y: nextVal.y, v: nextVal.v + 1 });
        queue.push({ x: nextVal.x - 1, y: nextVal.y, v: nextVal.v + 1 });
        queue.push({ x: nextVal.x, y: nextVal.y + 1, v: nextVal.v + 1 });
        queue.push({ x: nextVal.x, y: nextVal.y - 1, v: nextVal.v + 1 });
    }

    return tileArr;
}


/** Internal function that performs diamond and/or square mapping, based on queue additions. */
function performMapping(queueFn: (queue: WeightedPosition[], val: WeightedPosition) => void) {

}

/** Initializes values in the return array and intenral queue. */
export function initializeEdges(tileArr: number[][], queue: WeightedPosition[], mapSize: number): void {

    // Add top/bottom edges
    for (let i = 0; i < mapSize; i++) {
        tileArr[0][i] = -1;
        tileArr[mapSize - 1][i] = -1

        if (i > 0 && i < mapSize - 1) {
            queue.push({ x: i, y: 1, v: 1 });
            queue.push({ x: i, y: mapSize - 2, v: 1 });
        }
    }

    // Add left/right edges
    for (let i = 1; i < mapSize - 1; i++) {
        tileArr[i][0] = -1;
        tileArr[i][mapSize - 1] = -1

        if (i > 1 && i < mapSize - 2) {
            queue.push({ x: 1, y: i, v: 1 });
            queue.push({ x: mapSize - 2, y: i, v: 1 });
        }
    }
}
