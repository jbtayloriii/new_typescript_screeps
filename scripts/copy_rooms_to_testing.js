// Script for copying all terrain/object data into the testing subfolder.
import * as path from 'path';
import fs from 'node:fs/promises';

const MAP_SIZE = 50;

const TILE_TYPE_TABLE = {
  "wall": 1,
  "swamp": 2,
};

const ROOM_OBJECT_TABLE = {
  'source': 'S',
  'controller': 'C',
}

async function* walk(dir_filepath) {
  for await (const d of await fs.opendir(dir_filepath)) {
    const entry = path.join(dir_filepath, d.name);
    if (d.isFile()) {
      yield { filepath: entry, filename: d.name }; // Yield the file path
    }
  }
}

async function parseAndSaveRoom(terrainData, objectData, filename) {
  let tileArr = Array.from({ length: MAP_SIZE }, () => Array(MAP_SIZE).fill(0));

  for (let i = 0; i < terrainData.terrain.length; i++) {
    let row = terrainData.terrain[i];
    let x = row.x;
    let y = row.y;
    tileArr[y][x] = TILE_TYPE_TABLE[row.type] ?? 0;
  }

  for (let v of objectData) {
    const type = v.type;
    if (!ROOM_OBJECT_TABLE.hasOwnProperty(type)) {
      console.log(`Cannot parse object ${v}`);
      continue;
    }
    const objectSymbol = ROOM_OBJECT_TABLE[type];

    tileArr[v.y][v.x] = objectSymbol;
  }

  const testFileContents = tileArr.map(row => row.join('')).join('\n');

  const testingFilepath = path.join(process.cwd(), "data/testing/rooms", filename);

  fs.writeFile(testingFilepath, testFileContents, err => {
    if (err) {
      console.error(err);
    }
  });

  console.log(`Saved condensed room to ${testingFilepath}`);
}

async function main() {
  let directory = path.join(process.cwd(), "data/rooms/terrain");
  for await (const { filepath: filepath, filename: filename } of walk(directory)) {
    const terrainData = await fs.readFile(filepath, "utf-8");

    const objectFilepath = path.join(process.cwd(), 'data/rooms/objects', filename);
    const objectData = await fs.readFile(objectFilepath, "utf-8");

    const newFilename = filename.replace('\.json', '.txt')

    parseAndSaveRoom(JSON.parse(terrainData), JSON.parse(objectData), newFilename);
  }
}

main();
