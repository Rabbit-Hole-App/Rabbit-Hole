// The usage analytics build configuration (usage-analytics.js): set only by the production release (scripts/prod-release.mjs
// BUILD_ENV) or a dev build that names its own environment. Unset, analytics is off. Imported by Vite-built entries only.
import { installUsageAnalytics } from './usage-analytics.js';
import { mountConsentBanner } from './analytics-banner.js';

export const ANALYTICS_CONFIG = { token: import.meta.env.VITE_POSTHOG_TOKEN, host: import.meta.env.VITE_POSTHOG_HOST, env: import.meta.env.VITE_ANALYTICS_ENV || 'unknown' };
// The app's wiring (main.jsx). e2e/usage-analytics-check.mjs drives this same function in a real browser.
export const startAppAnalytics = () => { installUsageAnalytics(window, ANALYTICS_CONFIG, { account: true }); mountConsentBanner(window, ANALYTICS_CONFIG); };
