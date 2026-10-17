#!/usr/bin/env sh
# Builds the deploy context for rabbit-hole-convert-dev from the COMMITTED tree (git archive of
# packages/file-convert at HEAD), so the image is exactly one commit. Mutates no infrastructure:
# it prints the commands to run.
#
#   sh packages/file-convert/context.sh [contextDir]
set -eu
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
if [ -n "$(git status --porcelain -- packages/file-convert)" ]; then
  echo "✗ commit packages/file-convert first: the image is built from HEAD, not the working tree"; exit 1
fi
SHA=$(git rev-parse HEAD)
CTX=${1:-$(mktemp -d)}
mkdir -p "$CTX"
git archive --format=tar HEAD packages/file-convert > "$CTX/src.tar"
cp packages/file-convert/Dockerfile packages/file-convert/fly.dev.toml "$CTX/"
echo "✓ context: $CTX (HEAD $SHA)"
echo "Once per app (rabbit-hole org; token values are never printed or committed):"
echo "  fly apps create rabbit-hole-convert-dev --org rabbit-hole"
echo "  fly secrets set --stage CONVERT_TOKEN=<fresh, at least 32 random characters> CONVERT_ALLOWED_ORIGINS=<control plane origin> -a rabbit-hole-convert-dev"
echo "Deploy this commit:"
echo "  fly deploy $CTX --config $CTX/fly.dev.toml --build-arg CONVERT_BUILD=$SHA --ha=false --remote-only"
