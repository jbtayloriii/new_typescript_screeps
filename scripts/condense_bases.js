// Script for turning pulled base data into smaller int maps.
import * as path from 'path';
import fs from 'node:fs/promises';

const MAP_SIZE = 50;

const TILE_TYPE_TABLE = {
  "wall": 1,
  "swamp": 2,
};

export async function* walk(dir_filepath) {
  for await (const d of await fs.opendir(dir_filepath)) {
    const entry = path.join(dir_filepath, d.name);
    if (d.isFile()) {
      yield entry; // Yield the file path
    }
  }
}

let directory = path.join(process.cwd(), "data", "rooms");

(async () => {
  console.log(`Traversing ${directory}`);
  for await (const filepath of walk(directory)) {
    const data = await fs.readFile(filepath, "utf-8");

    const jsonData = JSON.parse(data);

    let tileArr = Array.from({ length: MAP_SIZE }, () => Array(MAP_SIZE).fill(0));

    for (let i = 0; i < jsonData.terrain.length; i++) {
      let row = jsonData.terrain[i];
      let x = row.x;
      let y = row.y;
      tileArr[y][x] = TILE_TYPE_TABLE[row.type] ?? 0;
    }

    let distances = getDistances(jsonData.terrain);

    console.log("Old arr:");
    tileArr.forEach((row) => {
      console.log(row.join(""));
    });
    console.log("");

    console.log("New arr:");
    // distances.forEach((row) => {
    //   console.log(row.map(v => `${v}`.padStart(3, " ")).join(""));
    // });

    distances.forEach((row) => {
      console.log(row.map(v => v == -1 ? 0 : v).join(""));
    });
  }
})();


/** Takes a 2D terrain array */
function getDistances(terrainList) {
  let tileArr = Array.from({ length: MAP_SIZE }, () => Array(MAP_SIZE).fill(0));

  let queue = [];
  terrainList.forEach((row) => {

    if (row.type !== "wall") {
      return;
    }

    tileArr[row.y][row.x] = -1;
    queue.push({ x: row.x + 1, y: row.y, v: 1 });
    queue.push({ x: row.x - 1, y: row.y, v: 1 });
    queue.push({ x: row.x, y: row.y + 1, v: 1 });
    queue.push({ x: row.x, y: row.y - 1, v: 1 });
  });

  while (queue.length > 0) {
    let nextVal = queue.shift();

    if (nextVal.x >= MAP_SIZE || nextVal.x < 0) {
      continue;
    }

    if (nextVal.y >= MAP_SIZE || nextVal.y < 0) {
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
