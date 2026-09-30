// Rabbit Hole sign-in (Landing), wired to the web auth backend's Landing contract
// (docs/features/rabbit-hole-auth-backend.md "Landing integration contract"): Google and GitHub navigate
// the page to /auth/<provider>/start, email posts /auth/email/start, and `next` rides along. No passwords:
// the first sign-in creates the account, so /sign-up is the same screen as /sign-in. The backend owns
// /login, /logout, /auth, /auth/* and /test/*; this page never claims them.
import { AUTH_PATHS } from './auth-routes.js';

const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
const google = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285f4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.5 9.5 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.9 6-15.1Z"/><path fill="#34a853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.2a12.3 12.3 0 0 1-18.3-6.4H5.6v5.3A20.4 20.4 0 0 0 24 44Z"/><path fill="#fbbc05" d="M12.5 27.5a12.3 12.3 0 0 1 0-7V15H5.6a20.3 20.3 0 0 0 0 18l6.9-5.5Z"/><path fill="#ea4335" d="M24 11.7c3 0 5.7 1 7.8 3l5.9-5.9A19.8 19.8 0 0 0 24 4 20.4 20.4 0 0 0 5.6 15l6.9 5.5A12.2 12.2 0 0 1 24 11.7Z"/></svg>';
const github = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.82c.56.1.77-.24.77-.54v-2.09c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.4-1.23.72-1.51-2.5-.28-5.13-1.25-5.13-5.54 0-1.22.44-2.22 1.15-3-.12-.29-.5-1.43.11-2.98 0 0 .94-.3 3.08 1.15A10.7 10.7 0 0 1 12 6.15c.95 0 1.9.13 2.8.38 2.14-1.45 3.08-1.15 3.08-1.15.61 1.55.23 2.69.11 2.98.72.78 1.15 1.78 1.15 3 0 4.3-2.63 5.25-5.14 5.53.4.35.76 1.03.76 2.08v3.11c0 .3.21.65.78.54A11.2 11.2 0 0 0 12 .8Z"/></svg>';
const path = location.pathname.replace(/\/$/, '');
const page = AUTH_PATHS.includes(path) ? path.slice(1) : 'sign-in';
const query = new URLSearchParams(location.search);
// Only a same-site path, never a full URL (the backend validates it again).
const next = /^\/(?![/\\])/.test(query.get('next') || '') ? query.get('next') : '/apps';
const screens = {
  'sign-in': { title: 'Welcome back.', description: 'Pick up where your curiosity left off.', action: 'Continue with email' },
  'sign-up': { title: 'Start exploring.', description: 'One question can open a whole new world.', action: 'Continue with email' },
  'check-email': { title: 'Check your email.', description: 'We sent you a secure sign-in link.' },
};
const ERRORS = {
  unavailable: 'That sign-in option isn’t available right now. Try another one.',
  cancelled: 'Sign-in was cancelled.',
  expired: 'That sign-in attempt expired. Try again.',
  provider: 'We couldn’t finish signing you in. Try again.',
};
const screen = screens[page];
const content = document.querySelector('#auth-content');
document.title = `${({ 'sign-in': 'Sign in', 'sign-up': 'Create account', 'check-email': 'Check your email' })[page]} | Rabbit Hole`;

const social = () => `<div class="auth-social" aria-label="Sign-in options"><button class="auth-provider" type="button" data-provider="google">${google}Google</button><button class="auth-provider" type="button" data-provider="github">${github}GitHub</button></div><div class="auth-divider">or continue with email</div>`;
const form = () => `<form class="auth-form" novalidate>
    <div class="auth-field"><label for="email">Email</label><div class="auth-input-wrap">
      <input id="email" type="email" placeholder="you@example.com" autocomplete="email" required aria-describedby="email-error" inputmode="email" autocapitalize="none" spellcheck="false"></div>
      <p class="auth-error" id="email-error"></p></div>
    <button class="auth-primary" type="submit">${screen.action}${arrow}</button>
  </form>`;
const checkEmail = () => '<div class="auth-confirm-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></svg></div>';

function render(view) {
  const confirm = view === 'check-email', shown = screens[view];
  content.innerHTML = `${confirm ? checkEmail() : ''}
  <h1 class="auth-heading">${shown.title}</h1><p class="auth-description">${shown.description}</p>
  ${confirm ? '' : social() + form()}
  <p class="auth-status" role="status" aria-live="polite" hidden></p>
  <p class="auth-switch">${view === 'sign-in' ? 'New here? <a class="auth-text-link" href="/sign-up">Create an account</a>' : view === 'sign-up' ? 'Already have an account? <a class="auth-text-link" href="/sign-in">Sign in</a>' : '<a class="auth-text-link" href="/sign-in">Back to sign in</a>'}</p>`;
  if (!confirm) wire();
}

function notice(message) {
  const status = content.querySelector('.auth-status');
  status.textContent = message;
  status.hidden = false;
}

function validate(input) {
  const message = !input.value.trim() ? 'Enter your email address.' : input.validity.typeMismatch ? 'Enter a valid email address, like you@example.com.' : '';
  input.setAttribute('aria-invalid', String(Boolean(message)));
  document.getElementById('email-error').textContent = message;
  return !message;
}

function wire() {
  const input = content.querySelector('#email');
  input.addEventListener('blur', () => validate(input));
  input.addEventListener('input', () => { if (input.getAttribute('aria-invalid') === 'true') validate(input); });
  content.querySelectorAll('[data-provider]').forEach(button => button.addEventListener('click', () => {
    location.assign(`/auth/${button.dataset.provider}/start?next=${encodeURIComponent(next)}`);
  }));
  content.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!validate(input)) { input.focus(); return; }
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const response = await fetch('/auth/email/start', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: input.value.trim(), next }) });
      const body = await response.json().catch(() => ({}));
      // 200 shows only the check-your-email screen (a test instance's devLink is never shown here).
      if (response.ok) { render('check-email'); return; }
      notice(response.status === 400 ? 'Enter a valid email address, like you@example.com.' : response.status === 429 ? 'Too many sign-in links requested. Try again later.' : body.error || 'Sign-in is not available right now. Try again.');
    } catch { notice('Sign-in is not available right now. Try again.'); }
    button.disabled = false;
  });
}

render(page);
if (ERRORS[query.get('error')]) notice(ERRORS[query.get('error')]);
