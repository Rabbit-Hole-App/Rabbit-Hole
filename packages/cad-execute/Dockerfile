# Build from repository root. No deploy/provision implied by this image definition.
FROM node:24.19.0-trixie-slim@sha256:ab3eebe934147fee049b5eb83c570f68c849a13c930bdfa482de99fcdfa3b3de
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv iproute2 sudo procps ca-certificates && rm -rf /var/lib/apt/lists/*
COPY packages/cad-execute/requirements.lock /tmp/requirements.lock
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --require-hashes -r /tmp/requirements.lock \
 && PLAYWRIGHT_BROWSERS_PATH=/opt/browsers /opt/venv/bin/python -m playwright install --with-deps chromium
COPY packages/cad-execute /app
COPY packages/web/src/three-d-asset.js /web/src/three-d-asset.js
RUN python3 -c "from pathlib import Path; files=['entrypoint','sandbox/cad-sandbox','sandbox/sandbox-init']; [(lambda p: p.write_bytes(p.read_bytes().replace(bytes([13,10]),bytes([10]))))(Path('/app')/f) for f in files]"
RUN groupadd -g 10020 cad && useradd -u 10021 -g cad -M -d /var/cad -s /usr/sbin/nologin cad-svc \
 && useradd -u 10030 -g cad -M -d /nonexistent -s /usr/sbin/nologin cad-run0 \
 && mkdir -p /var/cad/jobs /var/cad/budget && chown cad-svc:cad /var/cad/budget && chmod 700 /var/cad/budget && chown -R root:root /app /opt/venv /opt/browsers && chmod -R a+rX,go-w /app /opt/venv /opt/browsers \
 && chmod 755 /app/sandbox/cad-sandbox /app/sandbox/sandbox-init /app/entrypoint \
 && printf 'cad-svc ALL=(root) NOPASSWD: /app/sandbox/cad-sandbox *\n' > /etc/sudoers.d/cad && chmod 440 /etc/sudoers.d/cad && visudo -cf /etc/sudoers.d/cad
ENV PORT=8080 DO_NOT_TRACK=1 CADGEN_TELEMETRY=0 CADGEN_UPDATE_CHECK=0 CADGEN_DAEMON=0 CI=1
ARG CAD_IMAGE_VERSION=unbuilt
ENV CAD_IMAGE_VERSION=$CAD_IMAGE_VERSION
EXPOSE 8080
ENTRYPOINT ["/app/entrypoint"]
