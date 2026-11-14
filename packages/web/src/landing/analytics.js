// Usage analytics on the public pages (docs/features/usage-analytics.md): the visitor's choice, and with acceptance one sanitized pageview
// per page load, under the same anonymous id the app identifies after sign-in. The sign-in pages are where every logout lands, so they clear an identified account.
import { installUsageAnalytics } from '../usage-analytics.js';
import { ANALYTICS_CONFIG } from '../analytics-config.js';
import { mountConsentBanner } from '../analytics-banner.js';
import { AUTH_PATHS } from './auth-routes.js';

const SHOW_LANDING_CONSENT_BANNER = false; // owner request 2026-11-14: hidden on the public pages for now; true restores it (and the Privacy page's Analytics preferences button)

installUsageAnalytics(window, ANALYTICS_CONFIG, { signedOut: AUTH_PATHS.includes(location.pathname.replace(/\/$/, '')) });
if (SHOW_LANDING_CONSENT_BANNER) mountConsentBanner(window, ANALYTICS_CONFIG);
