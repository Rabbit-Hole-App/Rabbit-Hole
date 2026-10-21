#!/usr/bin/env sh
# Builds the deploy context for a Motion Fly app from the COMMITTED tree, so the image is exactly one commit: the
# renderer workspace, the shared files it imports from other packages, the root manifests and every workspace
# package.json (npm ci needs them to read the lockfile). Mutates no infrastructure: it prints the commands Home runs.
#
#   sh packages/learn-render/motion/service/context.sh [--target renderer-dev|renderer|orchestrator] [contextDir]
#   sh packages/learn-render/motion/service/context.sh [--target ...] --paths   # what the archive holds (deploy-config.test.mjs)
#
# renderer-dev (the default): rabbit-hole-motion-renderer-dev, the approved development service.
# renderer, orchestrator: the production services, PREPARED; creating them needs the owner's priced approval
# (C:/s/spec/day-1021/motion-deploy-plan.md).
set -eu
TARGET=renderer-dev
if [ "${1:-}" = --target ]; then TARGET=${2:-}; shift 2; fi
case "$TARGET" in
  renderer-dev) APP=rabbit-hole-motion-renderer-dev; FLY=fly.dev.toml; DOCKER=Dockerfile; BUILD=MOTION_RENDERER_BUILD
    SECRETS="MOTION_RENDERER_TOKEN=<at least 32 random characters>" ;;
  renderer) APP=rabbit-hole-motion-renderer; FLY=fly.prod.toml; DOCKER=Dockerfile; BUILD=MOTION_RENDERER_BUILD
    SECRETS="MOTION_RENDERER_TOKEN=<a fresh value of at least 32 random characters>" ;;
  orchestrator) APP=rabbit-hole-motion-orchestrator; FLY=fly.orchestrator.toml; DOCKER=Dockerfile.orchestrator; BUILD=MOTION_ORCHESTRATOR_BUILD
    SECRETS="MOTION_ORCHESTRATOR_TOKEN=<at least 32 random characters, the same value as rabbit-hole-app's> MOTION_RENDERER_TOKEN=<rabbit-hole-motion-renderer's> ANTHROPIC_API_KEY=<the orchestrator's key> ANTHROPIC_WORKSPACE_ID=<its workspace>" ;;
  *) echo "✗ --target is renderer-dev, renderer or orchestrator"; exit 2 ;;
esac
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
# Files the image imports from other packages, archived from their one source of truth (never copied into learn-render).
# The renderer: motion/duration.js reads a stated duration with the Learner Intent Resolver's parser. The orchestrator:
# the pipeline's resolver, grounding and spend bound (control-plane src) and the one web module the resolver reads.
# The Dockerfile copies each, with its package.json ("type": "module").
if [ "$TARGET" = orchestrator ]; then SHARED="packages/control-plane/src packages/web/src/learn-outline-model.js"
else SHARED="packages/control-plane/src/request-duration.js"; fi
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
cp "packages/learn-render/motion/service/$DOCKER" "packages/learn-render/motion/service/$FLY" "$CTX/"
echo "✓ context: $CTX (HEAD $SHA, $(du -h "$CTX/src.tar" | cut -f1)) for $APP"
echo "Home, once per app (rabbit-hole org; values are never printed or committed):"
echo "  fly apps create $APP --org rabbit-hole"
echo "  fly secrets set --stage $SECRETS -a $APP"
echo "Deploy this commit:"
echo "  fly deploy $CTX --config $CTX/$FLY --build-arg $BUILD=$SHA --ha=false"
