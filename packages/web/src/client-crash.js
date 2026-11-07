// Crash reports for the owner (docs/features/telemetry.md "Crashes"): a React boundary, a failed artifact render or an uncaught window error
// is sent WITH its error message, stack and component stack, so the owner is told what happened, where and to whom. Unlike client.error
// (client-telemetry.js: a name and a fingerprint only), the words are sent here, after scrubbing page content out of them. The same body goes to
// two endpoints: /api/telemetry/crash (the app Worker: log and Sentry) and /api/crash/notify (the control plane: the owner's email, signed-in only).
// A plain module with its transport injected, so node tests drive it without a browser. Bounded: one report per failure per page load, 5 a page.
export const CRASH_ENDPOINTS = ['/api/telemetry/crash', '/api/crash/notify'];
export const CRASH_PAGE_MAX = 5;
export const CRASH_LIMITS = Object.freeze({ message: 300, stack: 2000, componentStack: 1000, route: 200, release: 40 });
const KINDS = new Set(['boundary', 'render_failed', 'uncaught']);
const ARTIFACT = /^[a-z0-9][a-z0-9_.:-]{0,63}$/i;

// Page content out, code locations in: URL queries and fragments, share tokens, emails and long tokens go; file names and line:column stay.
export function scrub(text, max) {
  return String(text ?? '')
    .replace(/(https?:[/][/][^\s)'"]*?)[?#][^\s)'"]*/g, '$1')
    .replace(/([/]b[/])[^/\s)'"?#]+/g, '$1[token]')
    .replace(/[^\s@<>()'"]+@[^\s@<>()'"]+[.][^\s@<>()'"]+/g, '[email]')
    .replace(/\b[A-Fa-f0-9]{24,}\b/g, '[token]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[token]')
    .slice(0, max);
}

// send(endpoint, body) -> a promise or nothing; identify(error) -> { name, fingerprint } (client-telemetry.js errorName / errorFingerprint).
export function createCrashReporter({ send, identify, route = () => '/', release = null, classes = { browser: 'other', device: 'desktop' }, online = () => true }) {
  const seen = new Set();
  let sent = 0;
  return {
    report(error, { kind, artifact = null, componentStack = '' } = {}) {
      try {
        if (!KINDS.has(kind) || sent >= CRASH_PAGE_MAX) return false;
        const { name, fingerprint } = identify(error);
        if (seen.has(fingerprint)) return false;
        seen.add(fingerprint);
        sent++;
        const body = JSON.stringify({
          v: 1, kind, artifact: artifact && ARTIFACT.test(artifact) ? artifact : null, name: String(name).slice(0, 40),
          message: scrub(typeof error === 'string' ? error : error?.message, CRASH_LIMITS.message), stack: scrub(error?.stack, CRASH_LIMITS.stack),
          component_stack: scrub(componentStack, CRASH_LIMITS.componentStack), route: String(route()).slice(0, CRASH_LIMITS.route),
          release: release ? String(release).slice(0, CRASH_LIMITS.release) : null, fingerprint, browser: { browser: classes.browser, device: classes.device }, online: online() !== false,
        });
        // Off the render path and fire-and-forget: a failed send is nothing the learner or the crash screen should wait on.
        for (const endpoint of CRASH_ENDPOINTS) Promise.resolve().then(() => send(endpoint, body)).catch(() => {});
        return true;
      } catch { return false; }
    },
  };
}

let installed = null;
export const installCrashReporter = reporter => { installed = reporter; return reporter; };
// No-op (false) until client-telemetry.js installs it on a page.
export const reportCrash = (error, options) => !!installed && installed.report(error, options);
export const resetCrashReporterForTests = () => { installed = null; };
