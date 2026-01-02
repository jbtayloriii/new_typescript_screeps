import * as path from 'path';
import fs from 'node:fs';

console.log("Testing");

const auth_codes_filepath = path.join(process.cwd(), "auth_codes.json");


fs.readFile(auth_codes_filepath, 'utf8', (err, data) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log(data);
});
