# scripts/r36-gate/templates/build-once.sh - sourced by the stack scripts. Builds dist + dist-dev for one flavor unless
# this part already built that exact flavor of this tree (packages/web/.gate-flavor). A prod build after a dev build
# overwrites dist, so the stamp then says prod and the next dev start rebuilds.
build_flavor() {
  local flavor=$1 logs=$2 stamp="$W/packages/web/.gate-flavor"
  if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$flavor $INT35_EXPECTED_TREE" ]; then echo "build $flavor reused"; return 0; fi
  rm -f "$stamp"
  if [ "$flavor" = prod ]; then
    local P2="VITE_RABBIT_HOLE=true VITE_NOTEBOOK_ORIGIN=https://rabbit-hole-canvas-notebook.tryrabbithole.workers.dev VITE_LESSON_NOTEBOOK_ORIGIN=https://rabbit-hole-notebook.tryrabbithole.workers.dev"
    (cd "$W/packages/web" && base env $P2 npx --no-install vite build > "$logs/build1.log" 2>&1 && base env $P2 npx --no-install vite build --outDir dist-dev > "$logs/build2.log" 2>&1) || return 1
  else
    (cd "$W/packages/web" && base npx --no-install vite build > "$logs/build1.log" 2>&1 && base env VITE_COACHING_DEV=true VITE_BYOC_DEV=true npx --no-install vite build --outDir dist-dev > "$logs/build2.log" 2>&1) || return 1
  fi
  echo "$flavor $INT35_EXPECTED_TREE" > "$stamp"
}
