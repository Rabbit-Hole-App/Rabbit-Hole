# Motion M1 Linux render image (spec §10.1). Built by run.sh from `git archive HEAD`, so the
# image is exactly the committed tree. Network is used at build time only (npm ci and the
# Chrome Headless Shell download); every render runs with `docker run --network none`.
# A local image, not a cloud resource. Same pattern as packages/math-renderer: Debian slim,
# non-root user, render tooling pinned by the lockfile and Remotion's tested Chrome.
FROM node:24.19.0-bookworm-slim
# Chrome Headless Shell runtime libraries (Remotion's Linux list). No system fonts: every
# composition draws with the bundled woff2 files.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 libasound2 \
      libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libpango-1.0-0 libcairo2 libcups2 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
ADD src.tar /repo/
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --no-audit --no-fund && cd packages/learn-render && npx remotion browser ensure
WORKDIR /repo/packages/learn-render
USER node
ENTRYPOINT ["node", "scripts/motion.mjs"]
CMD ["prove", "/out/demo-a"]
