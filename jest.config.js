import { createDefaultPreset } from "ts-jest";

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
export default {
  testEnvironment: "screeps-jest",
  transform: {
    ...tsJestTransformCfg,
  },
};
