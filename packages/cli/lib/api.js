'use strict';
const { load } = require('./config');

// Real value baked in before npm publish; SMALL_API env overrides for dev/test.
const DEFAULT_API = 'https://small-cp.zeroshothq.workers.dev';

function apiBase() {
  return process.env.SMALL_API || load().apiBase || DEFAULT_API;
}

async function call(method, path, body, { auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const { token } = load();
    if (!token) throw new Error('not logged in — run: small login');
    headers.Authorization = `Bearer ${token}`;
  }
  const resp = await fetch(apiBase() + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `${path} failed (${resp.status})`);
  return data;
}

module.exports = { call, apiBase };
