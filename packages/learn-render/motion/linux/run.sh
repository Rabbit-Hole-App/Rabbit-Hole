#!/usr/bin/env sh
# Motion M1 on Linux (spec §10.1, §26 M1): the same render, preview, contact sheet, final
# validation and two-fresh-context determinism check as on the authoring host, with the
# network denied at the OS level for every render. No model calls, no credentials.
#
#   sh packages/learn-render/motion/linux/run.sh docker  [outDir]   # any Docker host (Docker Desktop, WSL2, Ubuntu)
#   sh packages/learn-render/motion/linux/run.sh unshare [outDir]   # Ubuntu / WSL2 Ubuntu with Node 24, no Docker
#
# docker:  builds a local image from `git archive HEAD` (commit first), network only at build
#          time, then renders with `docker run --network none`.
# unshare: `npm ci` + Chrome download with the network, then renders inside a fresh network
#          namespace that has only loopback (`unshare -rn`, or sudo unshare where unprivileged
#          user namespaces are restricted, as on Ubuntu 24.04).
# Frame hashes are compared within one OS image only: Chromium rasterizes text and
# antialiasing differently across OSes, so Windows and Linux hashes are not expected to match.
set -eu
MODE=${1:-docker}
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
OUT=$(realpath -m "${2:-.small/motion-linux}")
mkdir -p "$OUT"
[ "$(uname -s)" = Linux ] || [ "$MODE" = docker ] || { echo "✗ unshare mode needs a Linux host (WSL2 Ubuntu works)"; exit 1; }

case "$MODE" in
docker)
  CTX=$(mktemp -d)
  git archive --format=tar HEAD > "$CTX/src.tar"
  cp packages/learn-render/motion/linux/Dockerfile "$CTX/"
  docker build -t rabbit-hole-motion-m1 "$CTX"
  RUN="docker run --rm --network none --user $(id -u):$(id -g) -e HOME=/tmp -v $OUT:/out"
  $RUN rabbit-hole-motion-m1 net-denied
  $RUN rabbit-hole-motion-m1 prove /out/demo-a
  ;;
unshare)
  command -v unshare >/dev/null && command -v ip >/dev/null || { echo "✗ needs unshare (util-linux) and ip (iproute2)"; exit 1; }
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --no-audit --no-fund
  (cd packages/learn-render && npx remotion browser ensure)
  cd packages/learn-render
  INNER="ip link set lo up && node scripts/motion.mjs net-denied && node scripts/motion.mjs prove '$OUT/demo-a'"
  if unshare -rn true 2>/dev/null; then
    unshare -rn sh -c "$INNER"
  else
    sudo unshare -n sh -c "ip link set lo up && exec setpriv --reuid=$(id -u) --regid=$(id -g) --init-groups sh -c 'node scripts/motion.mjs net-denied && node scripts/motion.mjs prove $OUT/demo-a'"
  fi
  ;;
*) echo "usage: run.sh docker|unshare [outDir]"; exit 2 ;;
esac
echo "✓ Linux report: $OUT/demo-a/report.json"
