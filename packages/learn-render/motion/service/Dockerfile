# rabbit-hole-motion-renderer-dev (spec §10.2): the Motion V1 DEVELOPMENT render service.
# Built from the context motion/service/context.sh makes (`git archive HEAD` of the renderer and
# the workspace manifests only), so the image is exactly a commit. Same pattern as
# packages/math-renderer: Debian slim, ffmpeg (Remotion's bundled build), non-root service user,
# bearer token, one render at a time, a hard timeout and an output cap.
FROM node:24.19.0-bookworm-slim AS build
WORKDIR /src
ADD src.tar /src/
# The renderer workspace and the root only: no web, worker or CLI dependencies in the image.
# No install scripts; Remotion's compositor binaries arrive as platform packages, and Chrome
# Headless Shell is downloaded explicitly next.
RUN npm ci --workspace packages/learn-render --include-workspace-root --ignore-scripts --no-audit --no-fund \
 && cd packages/learn-render && npx remotion browser ensure

FROM node:24.19.0-bookworm-slim
ARG MOTION_RENDERER_BUILD=unknown
# Chrome Headless Shell runtime libraries (Remotion's Linux list); iproute2 for the sandbox's
# loopback, sudo for the one launcher rule. No system fonts: compositions use the bundled woff2.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 \
      libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2 libcups2 \
      iproute2 sudo procps \
    && rm -rf /var/lib/apt/lists/*
# motion-svc runs the HTTP service; motion-render runs generated compositions. Separate uids,
# the SAME primary group motion and no supplementary groups: Fly starts the service with its
# primary gid only, so a supplementary group would silently not apply (the first Fly run hit
# EACCES on job.json that way). The motion group owns the job directories (2770, setgid) and
# the job input (0640). The render sandbox still sees only its own job directory.
RUN groupadd -g 10010 motion \
 && useradd -u 10011 -g motion -M -d /var/motion -s /usr/sbin/nologin motion-svc \
 && useradd -u 10012 -g motion -M -d /nonexistent -s /usr/sbin/nologin motion-render
COPY --from=build /src/package.json /app/package.json
COPY --from=build /src/node_modules /app/node_modules
COPY --from=build /src/packages/learn-render /app/packages/learn-render
# The renderer is root-owned and read-only to both users; the launcher and its init are root's.
RUN chown -R root:root /app && chmod -R a+rX,go-w /app \
 && install -m 0755 -o root -g root /app/packages/learn-render/motion/service/motion-sandbox /usr/local/sbin/motion-sandbox \
 && install -d -m 0755 /usr/local/lib/motion \
 && install -m 0755 -o root -g root /app/packages/learn-render/motion/service/sandbox-init /usr/local/lib/motion/sandbox-init \
 && install -m 0440 -o root -g root /app/packages/learn-render/motion/service/sudoers /etc/sudoers.d/motion \
 && visudo -cf /etc/sudoers.d/motion \
 && install -d -m 0750 -o motion-svc -g motion /var/motion \
 && install -d -m 2770 -o motion-svc -g motion /var/motion/jobs \
 && command -v unshare setpriv prlimit timeout ip sudo
ENV NODE_ENV=production MOTION_SANDBOX=linux PORT=8080 MOTION_RENDERER_BUILD=$MOTION_RENDERER_BUILD
WORKDIR /app/packages/learn-render
USER motion-svc
EXPOSE 8080
CMD ["node", "motion/service/server.mjs"]
