// Script for turning pulled base data into smaller int maps.
import * as path from 'path';
import fs from 'node:fs/promises';

const TILE_TYPE_TABLE = {
  "wall": 1,
  "swamp": 2,
};

async function* walk(dir_filepath) {
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
    console.log(jsonData);

    let tileArr = Array.from({ length: 50 }, () => Array(50).fill(0));

    for (let i = 0; i < jsonData.terrain.length; i++) {
      let row = jsonData.terrain[i];
      let x = row.x;
      let y = row.y;
      tileArr[y][x] = TILE_TYPE_TABLE[row.type] ?? 0;
    }

    // tileArr.forEach((row) => {
    //   console.log(row.join(""));
    // });
  }
})();
