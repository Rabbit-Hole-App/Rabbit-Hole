// The analytics choice banner, shared by the app and the public pages, so it is plain DOM. Shown until the visitor chooses, and again
// from "Analytics preferences". It takes no focus unless asked for, blocks nothing behind it, and sits bottom right. Not shown where the
// choice means nothing: a build without analytics, or a browser sending Do Not Track or Global Privacy Control.
import './analytics-banner.css';
import { BANNER_TEXT, BANNER_UPDATE_TEXT } from './analytics-copy.js';
import { CONSENT_EVENT, CONSENT_KEY, CONSENT_VERSION_KEY, PREFERENCES_EVENT, configured, consentState, needsConsentAnswer, optedOut, setConsent } from './analytics-consent.js';

let mounted = false;
export function mountConsentBanner(target, config) {
  const doc = target.document;
  if (mounted || !doc || !configured(config) || optedOut(target.navigator)) return;
  mounted = true;
  doc.documentElement.dataset.analyticsChoice = 'available'; // shows the public pages' link (footer-links.css)
  let banner = null, words = null, dismissed = false;
  const close = () => { banner?.remove(); banner = null; };
  const choose = choice => { dismissed = true; setConsent(target, choice); close(); };
  const open = focus => {
    if (!banner) {
      banner = doc.createElement('section');
      banner.className = 'rh-consent';
      banner.dataset.analyticsBanner = '';
      banner.setAttribute('aria-label', 'Analytics choice');
      const text = doc.createElement('p');
      words = doc.createTextNode('');
      const link = doc.createElement('a');
      link.href = '/privacy#technical';
      link.textContent = 'Privacy Policy';
      text.append(words, ' ', link);
      const actions = doc.createElement('div');
      actions.className = 'rh-consent-actions';
      for (const [choice, label] of [['accepted', 'Accept analytics'], ['rejected', 'Reject optional']]) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.dataset.analyticsChoose = choice;
        button.addEventListener('click', () => choose(choice));
        actions.append(button);
      }
      banner.append(text, actions);
      doc.body.append(banner);
    }
    // An acceptance from before version 2 is not the current choice: neither button is pressed, and the words say what is new.
    const state = consentState(target);
    words.data = state === 'outdated' ? BANNER_UPDATE_TEXT : BANNER_TEXT;
    for (const button of banner.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.analyticsChoose === state));
    if (focus) banner.querySelector('button').focus();
  };
  const refresh = () => { if (!needsConsentAnswer(target)) close(); else if (!dismissed) open(false); };
  refresh();
  target.addEventListener(CONSENT_EVENT, refresh);
  target.addEventListener('storage', event => { if (event.key === CONSENT_KEY || event.key === CONSENT_VERSION_KEY || event.key === null) { dismissed = false; refresh(); } });
  target.addEventListener(PREFERENCES_EVENT, () => open(true));
  doc.addEventListener('click', event => {
    if (!event.target?.closest?.('[data-analytics-preferences]')) return;
    event.preventDefault();
    open(true);
  });
}
