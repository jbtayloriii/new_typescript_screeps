import * as path from 'path';
import fs from 'node:fs';

console.log("Testing");

const auth_codes_filepath = path.join(process.cwd(), "scripts", "auth_codes.json");

const URL_ENDPOINT = "https://screeps.com/api/";
const TERRAIN_URL = path.join(URL_ENDPOINT, "/game/room-terrain");
const OBJECTS_URL = path.join(URL_ENDPOINT, '/game/room-objects');


function getRoomData(roomName) {
  fs.readFile(auth_codes_filepath, 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      return;
    }

    let authCode = JSON.parse(data).code;

    // Terrain
    let terrainUrl = new URL(TERRAIN_URL);
    terrainUrl.searchParams.set("_token", authCode);
    terrainUrl.searchParams.set("shard", "shard0");
    terrainUrl.searchParams.set("room", roomName);

    console.log(terrainUrl.toString());

    fetch(terrainUrl.toString())
      .then(response => response.json())
      .then(data => writeRoomData(roomName, "terrain", data))
      .catch(error => console.error('Error:', error));

    // Objects
    let objectsUrl = new URL(OBJECTS_URL);
    objectsUrl.searchParams.set("_token", authCode);
    objectsUrl.searchParams.set("shard", "shard0");
    objectsUrl.searchParams.set("room", roomName);

    console.log(objectsUrl.toString());

    fetch(objectsUrl.toString())
      .then(response => response.json())
      .then(r => r.objects.filter(o => Object.hasOwn(o, "type") && (o.type === 'source' || o.type === 'controller')))
      .then(data => writeRoomData(roomName, "objects", data))
      .catch(error => console.error('Error:', error));
  });
}

function writeRoomData(roomName, roomSubDir, roomData) {
  let roomFilepath = path.join(process.cwd(), "data/rooms", roomSubDir, roomName + ".json");
  fs.writeFile(roomFilepath, JSON.stringify(roomData, null, 2), err => {
    if (err) {
      console.error(err);
    }
  });
}

function main(argv) {
  if (argv.length < 3) {
    console.log('Please specify a room to download, e.g. E1N1');
    return;
  }

  const roomName = argv[2]

  let room = /^([WE])([0-9]+)([NS])([0-9]+)$/.exec(roomName)[0];
  if (!room) {
    console.log(`${roomName} is an invalid room name, please specify a valid room name, e.g. E1N1`);
    return;
  }

  console.log(`Fetching room ${room}`);
  getRoomData(room);
  console.log('Finished data fetch');
}

main(process.argv);
