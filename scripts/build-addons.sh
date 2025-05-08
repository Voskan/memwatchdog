#!/usr/bin/env bash
# ------------------------------------------------------------------------------
#  build-addons.sh — Cross-platform helper to pre-build memwatchdog native addon
# ------------------------------------------------------------------------------

set -euo pipefail

# ─── Paths ────────────────────────────────────────────────────────────────────
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NATIVE_DIR="$REPO_DIR/native"
PREBUILDS_DIR="$NATIVE_DIR/prebuilds"

# ─── Helpers ─────────────────────────────────────────────────────────────────
need() { command -v "$1" >/dev/null 2>&1 || { echo "❌  $1 is required"; exit 1; }; }
banner() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }

# ─── Prerequisites ───────────────────────────────────────────────────────────
for bin in node npm npx make; do need "$bin"; done

# local dev-deps (node-gyp, prebuildify)
if ! pnpm ls -r --depth -1 node-gyp prebuildify >/dev/null 2>&1; then
  banner "Installing local dev-deps (node-gyp, prebuildify)…"
  pnpm add -Dw node-gyp prebuildify >/dev/null
fi

# resolve executables via npx
NODE_GYP="npx --yes node-gyp"
PREBUILDIFY="npx --yes prebuildify"

# ─── Build for current host runtime ──────────────────────────────────────────
banner "Building addon for host Node (ABI $(node -p 'process.versions.modules'))…"
cd "$NATIVE_DIR"
$NODE_GYP rebuild --release

mkdir -p "$PREBUILDS_DIR"
PLATFORM="$(node -p 'process.platform')"
ARCH="$(node -p 'process.arch')"
ABI="$(node -p 'process.versions.modules')"
DEST="$PREBUILDS_DIR/${PLATFORM}-${ARCH}"
mkdir -p "$DEST"
cp "build/Release/memwatchdog_native.node" "$DEST/memwatchdog_native.node"
banner "✔ Local build → $DEST"

# dev tools we need locally
DEV_PKGS=(node-gyp prebuildify node-addon-api)

for p in "${DEV_PKGS[@]}"; do
  pnpm ls -r --depth -1 "$p" >/dev/null 2>&1 || {
    banner "Installing $p…"
    pnpm add -Dw "$p" >/dev/null
  }
done

# ─── Optional matrix build via prebuildify-ci ────────────────────────────────
if [[ "${1:-}" == "--matrix" ]]; then
  need docker
  banner "Running prebuildify-ci matrix…"
  $PREBUILDIFY \
    --cwd "$NATIVE_DIR" \
    --napi \
    --strip \
    --targets "18.19.0,20.11.0,21.6.2" \
    --tag-libc "glibc,musl" \
    --arch "x64,arm64" \
    --platform "linux,darwin,win32" \
    --out "$PREBUILDS_DIR"
  banner "✔ Matrix build complete → $(du -sh "$PREBUILDS_DIR" | awk '{print $1}')"
fi

banner "All done."
