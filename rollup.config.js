"use strict";

import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
import screepsUpload from "./rollup-plugin-screeps-upload.js";

let cfg;

const dest = "sim";
// const dest = process.env.DEST;

if (!dest) {
  console.log("No destination specified - code will be compiled but not uploaded");
} else if ((cfg = require("./screeps.json")[dest]) == null) {
  throw new Error("Invalid upload destination");
}

export default {
  input: 'src/main.ts',
  output: {
    file: 'dist/main.js/main.js',
    format: 'cjs',
    sourcemap: true
  },
  plugins: [
    resolve(),
    commonjs(),
    typescript({tsconfig: "./tsconfig.json"}),
    screepsUpload({
      configFile: "./screeps.json",
      destination: dest})
  ]
}