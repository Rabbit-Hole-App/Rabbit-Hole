// Motion M7B: @hyperframes/producer depends on puppeteer, but every HyperFrames render uses
// Remotion's pinned Chrome Headless Shell (packages/learn-render/motion/hyperframes-renderer.mjs),
// so puppeteer's own browser download is skipped: one Chromium for both Motion renderers.
module.exports = { skipDownload: true };
