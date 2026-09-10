'use strict';
const crypto = require('node:crypto');
const http = require('node:http');
const { spawn } = require('node:child_process');
const config = require('./config');

const signInError = () => new Error('Sign in to this installation: small login --api <installation-url>');

function settings(base, value) {
  const url = new URL(base);
  if (url.origin !== base || url.protocol !== 'https:'
      || !/^https:\/\/cognito-idp\.us-east-1\.amazonaws\.com\/us-east-1_[A-Za-z0-9]+$/.test(value.issuer)
      || !/^[a-z0-9]{1,128}$/.test(value.clientId)
      || !/^https:\/\/[a-z0-9-]+\.auth\.us-east-1\.amazoncognito\.com$/.test(value.cognitoDomain)
      || !/^http:\/\/(127\.0\.0\.1|localhost):8766\/auth\/callback$/.test(value.cliRedirectUri)) {
    throw new Error('Invalid private installation settings; update the AWS installation before CLI login');
  }
  return { origin: base, issuer: value.issuer, clientId: value.clientId, cognitoDomain: value.cognitoDomain, cliRedirectUri: value.cliRedirectUri };
}

async function discover(base) {
  const url = new URL(base);
  if (url.origin !== base || url.username || url.password) throw new Error('--api needs an installation origin without a path');
  const response = await fetch(base + '/api/auth/config', { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (response.status === 404) return null;
  // Existing hosted control planes authenticate unknown /api paths before 404.
  if (response.status === 401 && (await response.json().catch(() => ({}))).error === 'run small login first') return null;
  if (!response.ok) throw new Error('Could not read the installation login settings');
  const data = await response.json();
  if (!data.issuer) return null;
  return settings(base, data);
}

function verifyToken(token, cfg, jwks, { use, nonce, subject } = {}) {
  try {
    if (typeof token !== 'string' || token.length > 16000) throw new Error();
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error();
    const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
    const body = JSON.parse(Buffer.from(parts[1], 'base64url'));
    const jwk = jwks.keys.find((key) => key.kid === header.kid && key.kty === 'RSA' && key.use === 'sig' && key.alg === 'RS256');
    if (header.alg !== 'RS256' || !jwk || !crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]),
      crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw new Error();
    const now = Date.now() / 1000;
    if (body.iss !== cfg.issuer || body.token_use !== use || typeof body.sub !== 'string' || !body.sub
        || !Number.isFinite(body.exp) || body.exp <= now || !Number.isFinite(body.iat) || body.iat > now + 60
        || (use === 'id' ? body.aud !== cfg.clientId : body.client_id !== cfg.clientId || !body.scope?.split(' ').includes('openid'))
        || (nonce !== undefined && body.nonce !== nonce) || (subject !== undefined && body.sub !== subject)) throw new Error();
    return body;
  } catch { throw new Error('Cognito returned an invalid identity token'); }
}

async function tokens(cfg, values, { fetcher = fetch, nonce, subject, refreshToken } = {}) {
  const response = await fetcher(cfg.cognitoDomain + '/oauth2/token', { method: 'POST', redirect: 'error',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(20000),
    body: new URLSearchParams({ client_id: cfg.clientId, ...values }).toString() });
  if (!response.ok) throw signInError();
  const result = await response.json();
  if (result.token_type !== 'Bearer' || !Number.isFinite(result.expires_in) || result.expires_in <= 0 || result.expires_in > 86400) throw signInError();
  const keyResponse = await fetcher(cfg.issuer + '/.well-known/jwks.json', { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!keyResponse.ok) throw signInError();
  const jwks = await keyResponse.json();
  const id = verifyToken(result.id_token, cfg, jwks, { use: 'id', nonce, subject });
  const access = verifyToken(result.access_token, cfg, jwks, { use: 'access', subject: id.sub });
  if (id.at_hash && id.at_hash !== crypto.createHash('sha256').update(result.access_token).digest().subarray(0, 16).toString('base64url')) throw signInError();
  return { ...cfg, sub: id.sub, access_token: result.access_token, refresh_token: result.refresh_token || refreshToken,
    expires_at: Math.min(Date.now() + result.expires_in * 1000, access.exp * 1000) };
}

function openBrowser(url) {
  const [command, args] = process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {}); // the printed URL also works on a machine without a browser
  child.unref();
}

async function login(base, value, { fetcher = fetch, save = config.save, log = console.log, onAuthorize = openBrowser, timeoutMs = 300000 } = {}) {
  const cfg = settings(base, value), callback = new URL(cfg.cliRedirectUri);
  const random = () => crypto.randomBytes(32).toString('base64url');
  const state = random(), nonce = random(), verifier = random();
  const url = new URL(cfg.cognitoDomain + '/oauth2/authorize');
  url.search = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.cliRedirectUri, response_type: 'code',
    scope: 'openid email', state, nonce, code_challenge_method: 'S256', code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url') }).toString();
  return new Promise((resolve, reject) => {
    let settled = false, redeeming = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      error ? reject(error) : resolve(result);
    };
    const server = http.createServer(async (request, response) => {
      const reply = (status, message) => { response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'", 'X-Content-Type-Options': 'nosniff' }); response.end(message); };
      const input = new URL(request.url, cfg.cliRedirectUri);
      if (request.method !== 'GET' || request.headers.host !== callback.host || input.pathname !== callback.pathname
          || input.searchParams.get('state') !== state || redeeming || settled) return reply(400, 'Invalid login callback. Use the link printed by your CLI.');
      redeeming = true;
      try {
        const code = input.searchParams.get('code');
        if (input.searchParams.has('error') || !code || code.length > 4096) throw signInError();
        const session = await tokens(cfg, { grant_type: 'authorization_code', code, redirect_uri: cfg.cliRedirectUri, code_verifier: verifier }, { fetcher, nonce });
        const membership = await fetcher(base + '/api/workspaces', { headers: { Authorization: 'Bearer ' + session.access_token }, redirect: 'error', signal: AbortSignal.timeout(20000) });
        if (!membership.ok) throw new Error('Your account has not been added to this Small workspace');
        const member = await membership.json();
        if (!member.active || !member.workspaces?.some((workspace) => workspace.slug === member.active)) throw new Error('Small did not return a workspace');
        if (settled) throw signInError();
        save({ ...config.load(), apiBase: base, authType: 'cognito', cognito: session, email: member.email, org: member.active });
        reply(200, 'Signed into Small. You can close this tab and return to the CLI.');
        finish(null, member);
      } catch (error) {
        reply(400, 'Sign-in could not be completed. Return to the CLI and try again.');
        finish(error);
      }
    });
    const timer = setTimeout(() => finish(new Error('Login timed out; run small login again')), timeoutMs);
    server.on('error', (error) => finish(new Error(error.code === 'EADDRINUSE' ? 'Login port 8766 is busy; close the other Small login and retry' : 'Could not open the local login callback')));
    server.listen(Number(callback.port), '127.0.0.1', () => {
      log('Open this link on the computer running the CLI:\n' + url.href);
      Promise.resolve().then(() => onAuthorize(url.href)).catch((error) => finish(error));
    });
  });
}

async function accessToken(base, session, { fetcher = fetch, save = config.save } = {}) {
  if (!session || session.origin !== base) throw signInError();
  if (session.access_token && session.expires_at > Date.now() + 30000) return session.access_token;
  if (!session.refresh_token) throw signInError();
  settings(base, session);
  let renewed;
  try { renewed = await tokens(session, { grant_type: 'refresh_token', refresh_token: session.refresh_token },
    { fetcher, subject: session.sub, refreshToken: session.refresh_token }); } catch { throw signInError(); }
  // Never overwrite a different login if another command changed the config.
  const current = config.load();
  if (current.cognito?.origin === base && current.cognito.sub === session.sub) save({ ...current, cognito: renewed });
  return renewed.access_token;
}

module.exports = { settings, discover, verifyToken, login, accessToken };
