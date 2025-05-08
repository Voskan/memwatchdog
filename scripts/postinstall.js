#!/usr/bin/env node
/**
 * @file postinstall.js
 * @description Fetch or build the memwatchdog native addon after `npm install`
 *
 *  Workflow
 *  --------
 *  1. **Skip conditions.** If the user sets `MEMWATCHDOG_SKIP_POSTINSTALL=1`
 *     (CI image builds, slim containers, etc.) we simply exit.
 *  2. **Try to load prebuilt binary** from `native/prebuilds/<plat>-<arch>/`.
 *     This is the common case — the tarball published to npm already
 *     contains matched binaries for all LTS Node versions.
 *  3. **Fallback to local compilation** via `node-gyp` when:
 *        • Matching prebuilt was not found (e.g., exotic CPU arch).
 *        • User installs package directly from Git or local path.
 *     Compilation is attempted in Release mode and on success the freshly
 *     built `.node` file is copied to `prebuilds/` for future reuse.
 *
 *  Users can always pre‑install their own binary and set
 *  `MEMWATCHDOG_NATIVE_PATH` to bypass this script entirely.
 */

const { join } = require("path");
const { existsSync, mkdirSync, copyFileSync } = require("fs");
const { spawnSync } = require("child_process");

const root = join(__dirname, "..");
const nativeDir = join(root, "native");
const prebuildsDir = join(nativeDir, "prebuilds");
const platformArch = `${process.platform}-${process.arch}`;
const abi = process.versions.modules;
const prebuiltPath = join(
  prebuildsDir,
  platformArch,
  "memwatchdog_native.node"
);

function log(msg) {
  console.log(`[memwatchdog] ${msg}`);
}

function tryRequireNative() {
  try {
    require("node-gyp-build")(nativeDir);
    return true;
  } catch (_) {
    return false;
  }
}

/* ----------------------------------------------------------------------- */
/*  Short‑circuit env switches                                              */
/* ----------------------------------------------------------------------- */

if (process.env.MEMWATCHDOG_SKIP_POSTINSTALL === "1") {
  log("Skipping postinstall hook due to env flag");
  process.exit(0);
}

if (process.env.MEMWATCHDOG_NATIVE_PATH) {
  log(
    `External native addon provided via MEMWATCHDOG_NATIVE_PATH → ${process.env.MEMWATCHDOG_NATIVE_PATH}`
  );
  process.exit(0);
}

/* ----------------------------------------------------------------------- */
/*  1) Prebuilt already bundled?                                            */
/* ----------------------------------------------------------------------- */

if (existsSync(prebuiltPath)) {
  log(`Prebuilt binary found (${platformArch}, ABI ${abi})`);
  process.exit(0);
}

/* ----------------------------------------------------------------------- */
/*  2) Attempt to load any compatible prebuilt (e.g., musl vs glibc)       */
/* ----------------------------------------------------------------------- */

if (tryRequireNative()) {
  log("Compatible prebuilt binary already present — nothing to do");
  process.exit(0);
}

/* ----------------------------------------------------------------------- */
/*  3) Fallback: build from source                                         */
/* ----------------------------------------------------------------------- */

log(
  `No prebuilt binary for ${platformArch}, ABI ${abi}. Attempting local build…`
);
const result = spawnSync(
  process.execPath,
  ["node_modules/.bin/node-gyp", "rebuild", "--release"],
  {
    cwd: nativeDir,
    stdio: "inherit",
    env: { ...process.env, npm_config_loglevel: "silent" },
  }
);

if (result.status !== 0) {
  log("❌  Native build failed — memwatchdog will be unusable.");
  process.exit(1);
}

/* Copy build output into prebuilds for caching */
const built = join(nativeDir, "build", "Release", "memwatchdog_native.node");
try {
  const destDir = join(prebuildsDir, platformArch);
  mkdirSync(destDir, { recursive: true });
  copyFileSync(built, join(destDir, "memwatchdog_native.node"));
  log(`✔ Native addon built and cached to ${destDir}`);
} catch (err) {
  log(`⚠ Could not cache built binary: ${err.message}`);
}

log("Postinstall complete");
