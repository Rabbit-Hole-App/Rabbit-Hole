#!/bin/sh
# Runs one fixture through the REAL sandboxed child inside the deployed image, without the HTTP
# service or a control plane (so no allowlist change is needed). Root only, over fly ssh:
#   fly ssh console -a rabbit-hole-convert-dev -C "sh /app/proof/in-image-convert.sh slides sample.pptx"
# Prints result.json, then text.json when the converter wrote one; removes the workspace.
set -eu
CONVERTER=$1
FIXTURE=$2
case "$FIXTURE" in *[!A-Za-z0-9._-]*) echo "bad fixture name" >&2; exit 64 ;; esac
ID=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
D=/var/convert/jobs/$ID
mkdir -p "$D/in" "$D/out"
cp "/app/proof/fixtures/$FIXTURE" "$D/in/source"
printf '{"workspace_id":"%s","converter":"%s","options":{}}' "$ID" "$CONVERTER" > "$D/job.json"
chown -R convert-svc:convert "$D"
chmod 2770 "$D" "$D/in" "$D/out"
chmod 0640 "$D/job.json" "$D/in/source"
/usr/local/sbin/convert-sandbox "$ID" 3 >/dev/null 2>&1 || true
echo "--- result.json"; cat "$D/out/result.json"; echo
if [ -f "$D/out/text.json" ]; then echo "--- text.json"; cat "$D/out/text.json"; echo; fi
rm -rf "$D"
