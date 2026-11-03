// The footer's links (owner 2026-11-02): no Analytics preferences link (changed in Settings); Book a call
// opens the onboarding calendar in a new tab. footer-links.js imports its CSS, so its markup function is run from its source here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';

const source = readFileSync(new URL('./footer-links.js', import.meta.url), 'utf8').replace(/^import .*$/m, '').replace(/^document\..*$/m, '').replace(/^export /gm, '');
const { footerLinks, BOOK_CALL_URL } = new Function(`${source}
return { footerLinks, BOOK_CALL_URL };`)();
const row = () => parseHTML(`<!doctype html><html><body><div>${footerLinks()}</div></body></html>`).document;

test('the footer has no Analytics preferences link (owner 2026-11-02): the choice is changed in Settings', () => {
  assert.equal(row().querySelector('[data-analytics-preferences]'), null);
  assert.equal(footerLinks().includes('Analytics preferences'), false);
});

test('Book a call opens the onboarding calendar in a new tab, once, in the footer', () => {
  const calls = [...row().querySelectorAll('a')].filter(a => a.textContent.trim() === 'Book a call');
  assert.equal(calls.length, 1);
  assert.equal(BOOK_CALL_URL, 'https://calendly.com/yuvish-chin/rabbit-hole-onboarding');
  assert.deepEqual([calls[0].getAttribute('href'), calls[0].getAttribute('target'), calls[0].getAttribute('rel')], [BOOK_CALL_URL, '_blank', 'noopener noreferrer']);
});
