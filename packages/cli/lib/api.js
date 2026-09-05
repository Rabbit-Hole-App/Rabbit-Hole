'use strict';
const { load } = require('./config');

// Real value baked in before npm publish; SMALL_API env overrides for dev/test.
const DEFAULT_API = 'https://small-cp.zeroshothq.workers.dev';

function apiBase() {
  return process.env.SMALL_API || load().apiBase || DEFAULT_API;
}

async function call(method, path, body, { auth = true } = {}) {
  const isForm = body instanceof FormData; // fetch sets the multipart boundary itself
  const headers = isForm ? {} : { 'Content-Type': 'application/json' };
  if (auth) {
    const { token } = load();
    if (!token) throw new Error('not logged in - run: small login');
    headers.Authorization = `Bearer ${token}`;
  }
  const resp = await fetch(apiBase() + path, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `${path} failed (${resp.status})`);
  return data;
}

// Binary GET for run outputs - call() assumes JSON responses.
async function fetchRaw(path) {
  const { token } = load();
  if (!token) throw new Error('not logged in - run: small login');
  const resp = await fetch(apiBase() + path, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`${path} failed (${resp.status})`);
  return Buffer.from(await resp.arrayBuffer());
}

module.exports = { call, apiBase, fetchRaw };
