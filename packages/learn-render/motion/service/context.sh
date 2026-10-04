#!/usr/bin/env sh
# Builds the deploy context for rabbit-hole-motion-renderer-dev from the COMMITTED tree, so the
# image is exactly one commit: the renderer workspace, the root manifests and every workspace
# package.json (npm ci needs them to read the lockfile). Mutates no infrastructure: it prints
# the commands Home runs.
#
#   sh packages/learn-render/motion/service/context.sh [contextDir]
set -eu
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
if [ -n "$(git status --porcelain -- packages/learn-render package.json package-lock.json)" ]; then
  echo "✗ commit packages/learn-render first: the image is built from HEAD, not the working tree"; exit 1
fi
SHA=$(git rev-parse HEAD)
CTX=${1:-$(mktemp -d)}
mkdir -p "$CTX"
# shellcheck disable=SC2046
git archive --format=tar HEAD package.json package-lock.json packages/learn-render $(git ls-files 'packages/*/package.json') > "$CTX/src.tar"
cp packages/learn-render/motion/service/Dockerfile packages/learn-render/motion/service/fly.dev.toml "$CTX/"
echo "✓ context: $CTX (HEAD $SHA, $(du -h "$CTX/src.tar" | cut -f1))"
echo "Home, once per app (rabbit-hole org; the token value is never printed or committed):"
echo "  fly apps create rabbit-hole-motion-renderer-dev --org rabbit-hole"
echo "  fly secrets set --stage MOTION_RENDERER_TOKEN=<at least 32 random characters> -a rabbit-hole-motion-renderer-dev"
echo "Deploy this commit:"
echo "  fly deploy $CTX --config $CTX/fly.dev.toml --build-arg MOTION_RENDERER_BUILD=$SHA --ha=false"
