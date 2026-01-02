import * as path from 'path';
import fs from 'node:fs';
import { json } from 'node:stream/consumers';

console.log("Testing");

const auth_codes_filepath = path.join(process.cwd(), "scripts", "auth_codes.json");

const URL_ENDPOINT = "https://screeps.com/api/";
const TERRAIN_URL = path.join(URL_ENDPOINT, "/api/game/room-terrain");


fs.readFile(auth_codes_filepath, 'utf8', (err, data) => {
  if (err) {
    console.error(err);
    return;
  }

  let authCode = JSON.parse(data).code;

  console.log(authCode);
});
