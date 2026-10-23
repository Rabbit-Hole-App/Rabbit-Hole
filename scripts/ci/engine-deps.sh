#!/usr/bin/env bash
# Fast tier (Linux): system libraries and browser for each non-Chromium engine this part's checks launch (check-map.json
# "engine", collected by affected.mjs into sel.json "engines"). Usage: engine-deps.sh <engine>... (none: nothing to do).
# Why (owner 2026-10-23, a runner dependency, not a flake): in fast-e2e 39986263086 and 39990352203 apt's package download from
# azure.archive.ubuntu.com stalled after 9-22 of WebKit's 181 packages; the in-check install hit its 420 s timeout, the browser-only
# retry downloaded WebKit without them and the launch failed on "Host system is missing dependencies" (libgtk-4.so.1, ...).
# A good run fetches the same 117 MB in 6 s. So each apt attempt is bounded, a later one uses archive.ubuntu.com, and a preflight
# names any package still missing and fails here, before the build and the checks.
set -euo pipefail
[ $# -gt 0 ] || exit 0
CLI=${ENGINE_DEPS_CLI:-node_modules/@playwright/test/cli.js}   # under sudo by path: root's PATH may not have this node
NODE=$(command -v node); APT=${ENGINE_DEPS_APT:-/etc/apt}; SECONDS_PER_TRY=${ENGINE_DEPS_SECONDS:-120}
# A dead connection fails in 30 s and apt retries it, rather than hanging the attempt.
printf 'Acquire::Retries "3";\nAcquire::http::Timeout "30";\nAcquire::https::Timeout "30";\n' | sudo tee "$APT/apt.conf.d/80-engine-deps" > /dev/null
for attempt in 1 2 3; do
  echo "engine libraries for $*: attempt $attempt (at most ${SECONDS_PER_TRY}s)"
  # sudo outside timeout: timeout then signals root's apt/dpkg too. A good attempt takes under a minute.
  if sudo timeout -k 15 "$SECONDS_PER_TRY" "$NODE" "$CLI" install-deps "$@"; then break; fi
  echo "engine libraries attempt $attempt failed or timed out"
  sudo dpkg --configure -a || true   # an attempt killed mid-install leaves dpkg interrupted; apt refuses until this runs
  if [ "$attempt" = 1 ]; then
    files=$(sudo grep -rl 'azure\.archive\.ubuntu\.com' "$APT" || true)
    if [ -n "$files" ]; then echo "switching apt from azure.archive.ubuntu.com to archive.ubuntu.com in: $files"; echo "$files" | xargs sudo sed -i 's/azure\.archive\.ubuntu\.com/archive.ubuntu.com/g'; fi
  fi
done
# Preflight: Playwright's own list for these engines, simulated by apt-get install -s. It prints each missing package, exits 1.
if ! "$NODE" "$CLI" install-deps --dry-run "$@"; then
  echo "::error title=Browser libraries missing::$* cannot launch: the packages listed above are not installed after 3 bounded apt attempts (apt mirror unreachable?). Not a check failure; see docs/superpowers/specs/2026-10-13-ci-fast-and-reliable-design.md section 4."
  exit 1
fi
for attempt in 1 2; do
  if timeout -k 15 "$SECONDS_PER_TRY" "$NODE" "$CLI" install "$@"; then exit 0; fi
  echo "browser download for $* attempt $attempt failed or timed out"
done
echo "::error title=Browser download failed::$* could not be downloaded in 2 attempts of ${SECONDS_PER_TRY} s"
exit 1
