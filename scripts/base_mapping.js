import * as path from 'path';
import fs from 'node:fs';

console.log("Testing");

const auth_codes_filepath = path.join(process.cwd(), "scripts", "auth_codes.json");

const URL_ENDPOINT = "https://screeps.com/api/";
const TERRAIN_URL = path.join(URL_ENDPOINT, "/game/room-terrain");


function getRoomData(roomName) {
  fs.readFile(auth_codes_filepath, 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      return;
    }

    let authCode = JSON.parse(data).code;

    let url = new URL(TERRAIN_URL);
    url.searchParams.set("_token", authCode);
    url.searchParams.set("shard", "shard0");
    url.searchParams.set("room", roomName);

    console.log(url.toString());

    fetch(url.toString())
      .then(response => response.json())
      .then(data => writeRoomData(roomName, data))
      .catch(error => console.error('Error:', error));
  });
}

function writeRoomData(roomName, roomData) {
  let roomFilepath = path.join(process.cwd(), "data", "rooms", roomName + ".json");
  fs.writeFile(roomFilepath, JSON.stringify(roomData, null, 2), err => {
    if (err) {
      console.error(err);
    }
  });
}


getRoomData("E23S15");
