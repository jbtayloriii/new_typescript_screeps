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

/** Returns a 2d array giving the orthogonal AND diagonal distance to walls or edges.
 * 
 *  The array is returned as map[y][x], top to bottom, left to right.
 * 
 *  This is used for making square stamps of radius R: 
 * 
 *  W11111W    WSSSSSW
 *  1122211    .SSSSS.
 *  1223221 -> .SSXSS.
 *  1122211    .SSSSS.
 *  W11111W    WSSSSSW
 */
export function getSquareMapping(walls: Position[], mapSize: number = DEFAULT_MAP_SIZE): number[][] {
    let queueFn = function (queue: WeightedPosition[], visitedArr: boolean[][], nextVal: WeightedPosition) {
        for (let y = nextVal.y - 1; y <= nextVal.y + 1; y++) {
            for (let x = nextVal.x - 1; x <= nextVal.x + 1; x++) {
                if (y == nextVal.y && x == nextVal.x) {
                    continue;
                }
                if (y < 0 || x < 0) {
                    continue;
                }
                if (y >= mapSize || x >= mapSize) {
                    continue;
                }
                if (visitedArr[y][x]) {
                    continue;
                }

                queue.push({ x: x, y: y, v: nextVal.v + 1 });
            }
        }
    }

    return performMapping(walls, mapSize, queueFn);
}

/** Returns a 2d array giving the orthogonal distance to walls or edges.
 * 
 *  The array is returned as map[y][x], top to bottom, left to right.
 * 
 *  This is used for making diamond stamps of radius R: 
 * 
 *  W12321W    W..D..W
 *  1234321    ..DDD..
 *  2345432 -> .DDXDD.
 *  1234321    ..DDD..
 *  W12321W    W..D..W
 */
export function getDiamondMapping(walls: Position[], mapSize: number = DEFAULT_MAP_SIZE): number[][] {
    let queueFn = function (queue: WeightedPosition[], visitedArr: boolean[][], nextVal: WeightedPosition) {
        let lessX = nextVal.x - 1;
        let moreX = nextVal.x + 1;
        let lessY = nextVal.y - 1;
        let moreY = nextVal.y + 1;

        if (!visitedArr[nextVal.y][lessX] && lessX >= 0) {
            visitedArr[nextVal.y][lessX] = true;
            queue.push({ x: lessX, y: nextVal.y, v: nextVal.v + 1 });
        }
        if (!visitedArr[nextVal.y][moreX] && moreX < mapSize) {
            visitedArr[nextVal.y][moreX] = true;
            queue.push({ x: moreX, y: nextVal.y, v: nextVal.v + 1 });
        }

        // TODO: Figure out why flipping this condition is buggy
        if (lessY >= 0 && !visitedArr[lessY][nextVal.x]) {
            visitedArr[lessY][nextVal.x] = true;
            queue.push({ x: nextVal.x, y: lessY, v: nextVal.v + 1 });
        }

        // TODO: Figure out why flipping this condition is buggy
        if (moreY < mapSize && !visitedArr[moreY][nextVal.x]) {
            visitedArr[moreY][nextVal.x] = true;
            queue.push({ x: nextVal.x, y: moreY, v: nextVal.v + 1 });
        }
    }

    return performMapping(walls, mapSize, queueFn);
}


/** Internal function that performs diamond and/or square mapping, based on queue additions. */
function performMapping(walls: Position[], mapSize: number, queueFn: (queue: WeightedPosition[], visitedArr: boolean[][], val: WeightedPosition) => void) {
    let tileArr: number[][] = Array.from({ length: mapSize }, () => Array(mapSize).fill(0));
    let visitedArr: boolean[][] = Array.from({ length: mapSize }, () => Array(mapSize).fill(false));
    let queue: WeightedPosition[] = [];

    initializeEdges(tileArr, visitedArr, queue, mapSize);

    // Add walls and push values next to walls
    walls.forEach((row) => {
        tileArr[row.y][row.x] = -1;
        visitedArr[row.y][row.x] = true;
        queueFn(queue, visitedArr, { x: row.x, y: row.y, v: 0 });
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
        visitedArr[nextVal.y][nextVal.x] = true;
        queueFn(queue, visitedArr, nextVal);
    }

    return tileArr;
}

/** Initializes values in the return array and intenral queue. */
export function initializeEdges(
    tileArr: number[][],
    visitedArr: boolean[][],
    queue: WeightedPosition[],
    mapSize: number
): void {
    // Add top/bottom edges
    for (let i = 0; i < mapSize; i++) {
        tileArr[0][i] = -1;
        tileArr[mapSize - 1][i] = -1

        visitedArr[0][i] = true;
        visitedArr[mapSize - 1][i] = true;

        if (i > 0 && i < mapSize - 1) {
            queue.push({ x: i, y: 1, v: 1 });
            queue.push({ x: i, y: mapSize - 2, v: 1 });

            visitedArr[1][i] = true;
            visitedArr[mapSize - 2][i] = true;
        }
    }

    // Add left/right edges
    for (let i = 1; i < mapSize - 1; i++) {
        tileArr[i][0] = -1;
        tileArr[i][mapSize - 1] = -1

        visitedArr[i][0] = true;
        visitedArr[i][mapSize - 1] = true;

        if (i > 1 && i < mapSize - 2) {
            queue.push({ x: 1, y: i, v: 1 });
            queue.push({ x: mapSize - 2, y: i, v: 1 });

            visitedArr[i][1] = true;
            visitedArr[i][mapSize - 2] = true;
        }
    }
}
