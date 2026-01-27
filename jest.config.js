import { createDefaultPreset } from "ts-jest";

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
export default {
  setupFilesAfterEnv: ['./src/testing/jest_setup.ts'],
  testEnvironment: "screeps-jest",
  transform: {
    ...tsJestTransformCfg,
  },
};
