import { createDefaultPreset } from "ts-jest";

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
export default {
  setupFilesAfterEnv: ['./src/testing/jest_setup.ts'],
  testEnvironment: "screeps-jest",
  // Match tsconfig's baseUrl so imports like "logging/logger" resolve in tests.
  modulePaths: ['<rootDir>/src'],
  transform: {
    ...tsJestTransformCfg,
  },
};
