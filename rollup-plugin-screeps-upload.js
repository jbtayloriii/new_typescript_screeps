import { ScreepsAPI } from "screeps-api";
import { renameSync, readdirSync, readFileSync } from "fs";
import { dirname, extname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

function generateSourceMaps(bundle) {
  // Iterate through bundle and test if type===chunk && map is defined
  Object.keys(bundle).forEach((filename) => {
    const item = bundle[filename];
    if (item.type === "chunk" && item.map) {
      // Tweak maps
      const tmp = item.map.toString;
      //delete item.map.sourcesContent;
      item.map.toString = function () {
        // eslint-disable-next-line prefer-rest-params
        return "module.exports = " + tmp.apply(this, arguments) + ";";
      };
    }
  });
}

function writeSourceMaps(options) {
  renameSync(options.file + ".map", options.file + ".map.js");
}

function validateConfig(cfg) {
  return Object.values(cfg).reduce((a, b) => a && b);
}

function validateIndividualConfig(cfg) {
  if (cfg.hostname && cfg.hostname === "screeps.com") {
    return [
      typeof cfg.token === "string",
      cfg.protocol === "http" || cfg.protocol === "https",
      typeof cfg.hostname === "string",
      typeof cfg.port === "number",
      typeof cfg.path === "string",
      typeof cfg.branch === "string",
    ].reduce((a, b) => a && b);
  }
  return [
    (typeof cfg.email === "string" && typeof cfg.password === "string") ||
      typeof cfg.token === "string",
    cfg.protocol === "http" || cfg.protocol === "https",
    typeof cfg.hostname === "string",
    typeof cfg.port === "number",
    typeof cfg.path === "string",
    typeof cfg.branch === "string",
  ].reduce((a, b) => a && b);
}

function loadConfigFile(configFile, dest) {
  const data = readFileSync(configFile, "utf8");
  const cfg = JSON.parse(data);
  if (!validateConfig(cfg)) throw new TypeError("Invalid config");
  if (!dest in cfg) {
    throw new TypeError("Could not find destination: " + dest);
  }
  const config = cfg[dest];
  return config;
}

function uploadSource(configFile, dest, options) {
  if (!configFile) {
    console.log(
      "screeps() needs a config e.g. screeps({configFile: './screeps.json'}) or screeps({config: { ... }})"
    );
  } else {
    const config = loadConfigFile(configFile, dest);
    const code = getFileList(options.file);
    const branch = config.branch;
    const api = new ScreepsAPI(config);
    if (!config.token) {
      api.auth().then(() => {
        runUpload(api, branch, code);
      });
    } else {
      runUpload(api, branch, code);
    }
  }
}

function runUpload(api, branch, code) {
  api.raw.user.branches().then((data) => {
    const branches = data.list.map((b) => b.branch);
    if (branches.includes(branch)) {
      api.code.set(branch, code);
    } else {
      api.raw.user.cloneBranch("", branch, code);
    }
  });
}

function getFileList(outputFile) {
  const code = {};
  const base = dirname(outputFile);
  const files = readdirSync(base).filter(
    (f) => extname(f) === ".js" || extname(f) === ".wasm"
  );
  files.map((file) => {
    if (file.endsWith(".js")) {
      code[file.replace(/\.js$/i, "")] = readFileSync(join(base, file), "utf8");
    } else {
      code[file] = {
        binary: readFileSync(join(base, file)).toString("base64"),
      };
    }
  });
  return code;
}

function screepsUpload(screepsOptions = {}) {
  return {
    name: "screeps",
    generateBundle(options, bundle, isWrite) {
      if (options.sourcemap) console.log("generating source maps.");
      generateSourceMaps(bundle);
    },
    writeBundle(options, bundle) {
      if (options.sourcemap) writeSourceMaps(options);
      if (!screepsOptions.dryRun) {
        uploadSource(
          screepsOptions.configFile,
          screepsOptions.destination,
          options
        );
      }
    },
  };
}

export { screepsUpload as default };
