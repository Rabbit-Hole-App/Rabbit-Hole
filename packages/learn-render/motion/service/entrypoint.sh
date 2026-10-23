#!/bin/sh
# Image entrypoint (root-owned, installed at /usr/local/sbin/motion-entrypoint). Fly mounts a volume root-owned, and the service
# runs as motion-svc, so a configured job store is handed to motion-svc here, mode 0700 (the render user, same group, never
# reads it), and then root is dropped for good: motion-svc, primary group motion, no supplementary groups.
# A chown that fails is not fatal: /health then reports job_store.writable false and a required store refuses every job.
set -eu
DIR=${MOTION_JOB_STORE_DIR:-}
if [ -n "$DIR" ]; then
  mkdir -p "$DIR" && chown motion-svc:motion "$DIR" && chmod 0700 "$DIR" || echo "motion-entrypoint: cannot prepare $DIR" >&2
fi
exec setpriv --reuid=motion-svc --regid=motion --clear-groups -- env HOME=/var/motion "$@"
