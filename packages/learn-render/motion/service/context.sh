#!/usr/bin/env sh
# Builds the deploy context for rabbit-hole-motion-renderer-dev from the COMMITTED tree, so the
# image is exactly one commit: the renderer workspace, the shared files it imports from other
# packages, the root manifests and every workspace package.json (npm ci needs them to read the
# lockfile). Mutates no infrastructure: it prints
# the commands Home runs.
#
#   sh packages/learn-render/motion/service/context.sh [contextDir]
#   sh packages/learn-render/motion/service/context.sh --paths   # what the archive holds (deploy-config.test.mjs)
set -eu
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
# Files the service imports from other packages, archived from their one source of truth (never
# copied into learn-render): motion/duration.js reads a stated duration with the Learner Intent
# Resolver's parser. The Dockerfile copies each, with its package.json ("type": "module").
SHARED="packages/control-plane/src/request-duration.js"
PATHS="package.json package-lock.json packages/learn-render $SHARED $(git ls-files 'packages/*/package.json' | tr '\n' ' ')"
if [ "${1:-}" = --paths ]; then printf '%s\n' $PATHS; exit 0; fi
# shellcheck disable=SC2086
if [ -n "$(git status --porcelain -- packages/learn-render package.json package-lock.json $SHARED)" ]; then
  echo "✗ commit packages/learn-render first: the image is built from HEAD, not the working tree"; exit 1
fi
SHA=$(git rev-parse HEAD)
CTX=${1:-$(mktemp -d)}
mkdir -p "$CTX"
# shellcheck disable=SC2086
git archive --format=tar HEAD $PATHS > "$CTX/src.tar"
cp packages/learn-render/motion/service/Dockerfile packages/learn-render/motion/service/fly.dev.toml "$CTX/"
echo "✓ context: $CTX (HEAD $SHA, $(du -h "$CTX/src.tar" | cut -f1))"
echo "Home, once per app (rabbit-hole org; the token value is never printed or committed):"
echo "  fly apps create rabbit-hole-motion-renderer-dev --org rabbit-hole"
echo "  fly secrets set --stage MOTION_RENDERER_TOKEN=<at least 32 random characters> -a rabbit-hole-motion-renderer-dev"
echo "Deploy this commit:"
echo "  fly deploy $CTX --config $CTX/fly.dev.toml --build-arg MOTION_RENDERER_BUILD=$SHA --ha=false"
