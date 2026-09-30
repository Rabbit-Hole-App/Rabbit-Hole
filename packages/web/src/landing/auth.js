import { AUTH_PATHS } from './auth-routes.js';

const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
const eye = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="2.7"/><path class="eye-slash" d="m3 3 18 18"/></svg>';
const google = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285f4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.5 9.5 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.9 6-15.1Z"/><path fill="#34a853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.2a12.3 12.3 0 0 1-18.3-6.4H5.6v5.3A20.4 20.4 0 0 0 24 44Z"/><path fill="#fbbc05" d="M12.5 27.5a12.3 12.3 0 0 1 0-7V15H5.6a20.3 20.3 0 0 0 0 18l6.9-5.5Z"/><path fill="#ea4335" d="M24 11.7c3 0 5.7 1 7.8 3l5.9-5.9A19.8 19.8 0 0 0 24 4 20.4 20.4 0 0 0 5.6 15l6.9 5.5A12.2 12.2 0 0 1 24 11.7Z"/></svg>';
const github = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.82c.56.1.77-.24.77-.54v-2.09c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.4-1.23.72-1.51-2.5-.28-5.13-1.25-5.13-5.54 0-1.22.44-2.22 1.15-3-.12-.29-.5-1.43.11-2.98 0 0 .94-.3 3.08 1.15A10.7 10.7 0 0 1 12 6.15c.95 0 1.9.13 2.8.38 2.14-1.45 3.08-1.15 3.08-1.15.61 1.55.23 2.69.11 2.98.72.78 1.15 1.78 1.15 3 0 4.3-2.63 5.25-5.14 5.53.4.35.76 1.03.76 2.08v3.11c0 .3.21.65.78.54A11.2 11.2 0 0 0 12 .8Z"/></svg>';
const path = location.pathname.replace(/\/$/, '');
const page = AUTH_PATHS.includes(path) ? path.slice(1) : 'sign-in';
const screens = {
  'sign-in': { title: 'Welcome back.', description: 'Pick up where your curiosity left off.', action: 'Sign in' },
  'sign-up': { title: 'Start exploring.', description: 'One question can open a whole new world.', action: 'Create account' },
  'forgot-password': { title: 'A way back in.', description: 'Enter your email and we’ll send you a link to reset your password.', action: 'Send reset link' },
  'reset-password': { title: 'A fresh start.', description: 'Choose a new password. Your next question is waiting.', action: 'Reset password' },
  'check-email': { title: 'Check your inbox.', description: 'Your password reset link will arrive by email. Follow it to find your way back.' },
  'password-updated': { title: 'You’re ready.', description: 'A fresh password. The same curiosity. Sign in to pick up where you left off.' },
};
const screen = screens[page];
const content = document.querySelector('#auth-content');
document.title = `${({ 'sign-in': 'Sign in', 'sign-up': 'Create account', 'forgot-password': 'Forgot password', 'reset-password': 'Reset password', 'check-email': 'Check your email', 'password-updated': 'Password reset preview' })[page]} | Rabbit Hole`;

function field(id, label, { type = 'text', placeholder = '', autocomplete = '', hint = '' } = {}) {
  const password = type === 'password';
  return `<div class="auth-field"><label for="${id}">${label}</label><div class="auth-input-wrap">
    <input id="${id}" type="${type}" placeholder="${placeholder}" autocomplete="${autocomplete}" required aria-describedby="${id}-error${hint ? ` ${id}-hint` : ''}" ${password ? 'data-password' : ''} ${type === 'email' ? 'inputmode="email" autocapitalize="none" spellcheck="false"' : ''}>
    ${password ? `<button class="auth-password-toggle" type="button" data-toggle="${id}" aria-controls="${id}" aria-label="Show ${label.toLowerCase()}" aria-pressed="false">${eye}</button>` : ''}</div>
    ${hint ? `<p class="auth-hint" id="${id}-hint">${hint}</p>` : ''}<p class="auth-error" id="${id}-error"></p>
    ${password ? '<p class="auth-caps" hidden>Caps Lock is on.</p>' : ''}</div>`;
}

function social() {
  return `<div class="auth-social" aria-label="Other sign-in options"><button class="auth-provider" type="button" data-provider="Google">${google}Google</button><button class="auth-provider" type="button" data-provider="GitHub">${github}GitHub</button></div><div class="auth-divider">or continue with email</div>`;
}

function form() {
  const resetting = page === 'reset-password';
  return `<form class="auth-form" novalidate>
    ${resetting ? '' : field('email', 'Email', { type: 'email', placeholder: 'you@example.com', autocomplete: 'email' })}
    ${page === 'forgot-password' ? '' : field('password', resetting ? 'New password' : 'Password', { type: 'password', placeholder: page === 'sign-in' ? 'Enter your password' : 'Create a password', autocomplete: page === 'sign-in' ? 'current-password' : 'new-password', hint: page === 'sign-in' ? '' : 'Use 8 or more characters.' })}
    ${resetting ? field('confirm-password', 'Confirm new password', { type: 'password', placeholder: 'Enter it once more', autocomplete: 'new-password' }) : ''}
    ${page === 'sign-in' ? '<div class="auth-forgot"><a class="auth-text-link" href="/forgot-password">Forgot password?</a></div>' : ''}
    <button class="auth-primary" type="submit">${screen.action}${arrow}</button>
  </form>`;
}

function confirmation() {
  const email = page === 'check-email';
  return `<div class="auth-confirm-note"><strong>Design preview</strong>${email ? 'No email has been sent. Email delivery will be connected later.' : 'No password has been changed. Account security will be connected later.'}</div>
    <a class="auth-primary" href="${email ? '/reset-password' : '/sign-in'}">${email ? 'Preview reset form' : 'Back to sign in'}${arrow}</a>
    ${email ? '<div class="auth-recovery-links"><button class="auth-text-link" type="button" data-resend>Resend email</button><a class="auth-text-link" href="/forgot-password">Try another email</a></div>' : ''}`;
}

const confirm = page === 'check-email' || page === 'password-updated';
const icon = page === 'check-email' ? '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>' : '<path d="m5 12 4 4L19 6"/>';
content.innerHTML = `${confirm ? `<div class="auth-confirm-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${icon}</svg></div>` : ''}
  <h1 class="auth-heading">${screen.title}</h1><p class="auth-description">${screen.description}</p>
  ${['sign-in', 'sign-up'].includes(page) ? social() : ''}
  ${confirm ? confirmation() : form()}
  <p class="auth-status" role="status" aria-live="polite" hidden></p>
  <p class="auth-switch">${page === 'sign-in' ? 'New here? <a class="auth-text-link" href="/sign-up">Create an account</a>' : page === 'sign-up' ? 'Already have an account? <a class="auth-text-link" href="/sign-in">Sign in</a>' : page === 'password-updated' ? '<a class="auth-text-link" href="/">Back to Rabbit Hole</a>' : '<a class="auth-text-link" href="/sign-in">Back to sign in</a>'}</p>`;

function notice(message) {
  const status = content.querySelector('.auth-status');
  status.textContent = message;
  status.hidden = false;
}

function validate(input) {
  let message = '';
  if (!input.value || (input.type === 'email' && !input.value.trim())) message = input.id === 'email' ? 'Enter your email address.' : 'Enter your password.';
  else if (input.id === 'email' && input.validity.typeMismatch) message = 'Enter a valid email address, like you@example.com.';
  else if (input.id === 'password' && page !== 'sign-in' && input.value.length < 8) message = 'Use at least 8 characters.';
  else if (input.id === 'confirm-password' && input.value !== content.querySelector('#password').value) message = 'Your passwords don’t match yet.';
  input.setAttribute('aria-invalid', String(Boolean(message)));
  document.getElementById(`${input.id}-error`).textContent = message;
  return !message;
}

content.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', () => {
  const input = document.getElementById(button.dataset.toggle);
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  button.setAttribute('aria-pressed', String(visible));
  const label = content.querySelector(`label[for="${input.id}"]`).textContent.toLowerCase();
  button.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} ${label}`);
}));

content.querySelectorAll('input').forEach(input => {
  input.addEventListener('blur', () => validate(input));
  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true') validate(input);
    if (input.id === 'password') {
      const repeat = content.querySelector('#confirm-password');
      if (repeat?.value) validate(repeat);
    }
  });
  if (input.hasAttribute('data-password')) {
    const caps = input.closest('.auth-field').querySelector('.auth-caps');
    const checkCaps = event => { caps.hidden = !event.getModifierState('CapsLock'); };
    input.addEventListener('keydown', checkCaps);
    input.addEventListener('keyup', checkCaps);
    input.addEventListener('blur', () => { caps.hidden = true; });
  }
});

// ponytail: UI milestone only. Never post credentials or simulate authentication.
content.querySelector('form')?.addEventListener('submit', event => {
  event.preventDefault();
  const inputs = [...event.currentTarget.querySelectorAll('input')];
  const invalid = inputs.filter(input => !validate(input));
  if (invalid.length) { invalid[0].focus(); return; }
  event.currentTarget.reset();
  if (page === 'forgot-password') location.assign('/check-email');
  else if (page === 'reset-password') location.assign('/password-updated');
  else notice(page === 'sign-up' ? 'This is a design preview. No account was created. Account creation will be available when sign-up is connected.' : 'This is a design preview. Email and password sign-in is not connected yet. You can open the existing workspace below.');
});
content.querySelectorAll('[data-provider]').forEach(button => button.addEventListener('click', () => {
  notice(`${button.dataset.provider} sign-in is not connected yet. This preview does not open an account or request access.`);
}));
content.querySelector('[data-resend]')?.addEventListener('click', () => notice('No email was sent. Reset email delivery is not connected in this preview.'));
