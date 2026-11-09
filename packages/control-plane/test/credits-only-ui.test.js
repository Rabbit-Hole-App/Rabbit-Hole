// Owner 2026-10-23 (credits only): people see AI credits, never dollars, provider prices or the credit-to-dollar conversion.
// Scans the normal user-facing sources for a dollar sign on a number, an interpolated amount or the word dollar, and renders
// every refusal message. USD stays in internal accounting (pricing registry, owner/admin reports), which are not scanned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { ALLOWANCE_REASONS, refusalBody, spendMessage } from '../src/learn-spend-ledger.js';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const web = join(here, '../../web/src'), control = join(here, '../src');
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const isSource = file => /\.(js|jsx)$/.test(file) && !/\.test\./.test(file);
// Comments carry design notes with dollar figures; they are not shown to anyone.
const strip = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/(\s)\/\/\s.*$/gm, '$1');
// A dollar sign on a number, an interpolated money value, a money formatter, or the word dollar.
const MONEY = [/(^|[\s("'`>])\$(\d{2,}|\d+[.,]\d+|\d(?=\s+[A-Za-z]))/, /\$\$\{[^}]*(toFixed|\/\s*1e|Math\.)/, /\$\{[^}]*\b(usd|dollars?|price)\w*[^}]*\}/i, /\bdollars?\b/i];
// Internal, never rendered to a person: server price tables and fixtures whose text is data for a model.
// LearningBlocks.jsx holds TeX in lesson text ($65 	imes 384$), which is not money.
const INTERNAL = new Set(['pricing-registry.js', 'learn-usage-estimates.js', 'inline-ai-fixtures.js', 'LearningBlocks.jsx']);
// The owner telemetry dashboard is an operator surface for the owner only (the API answers 404 to everyone else; owner decisions
// 2026-10-23): it shows provider cost in dollars. It is never shown to a person using the product.
const OPERATOR_ONLY = new Set(['OwnerTelemetry.jsx']);

test('no user-facing source shows a dollar amount, a provider price or the word dollar', () => {
  const files = [...walk(web), ...walk(control)].filter(isSource).filter(file => !INTERNAL.has(basename(file)) && !OPERATOR_ONLY.has(basename(file)));
  const hits = [];
  for (const file of files) {
    strip(readFileSync(file, 'utf8')).split('\n').forEach((line, index) => {
      if (MONEY.some(pattern => pattern.test(line))) hits.push(`${relative(join(here, '../..'), file)}:${index + 1}: ${line.trim().slice(0, 140)}`);
    });
  }
  assert.deepEqual(hits, []);
});

test('the scanner catches what it is for', () => {
  for (const line of ['label: "$25 equivalent"', "const s = `$${(micros / 1e6).toFixed(2)}`", 'Costs $0.05 per image', 'Costs $5 per image', "'a dollar cap'", 'price ${priceUsd}']) assert.ok(MONEY.some(pattern => pattern.test(line)), line);
  for (const line of ['/^[a-z]+$/.test(x)', "'$1/'", 'const total = cost * 100;', "'2,500 AI credits every month'"]) assert.ok(!MONEY.some(pattern => pattern.test(line)), line);
});

test('every refusal a person can read speaks credits: no dollars, no provider price, no conversion', () => {
  const reasons = [...ALLOWANCE_REASONS, 'cap_unset', 'spend_bound_unavailable', 'daily_cap_reached', 'spend_schema_unavailable', 'anything_else'];
  for (const reason of reasons) {
    const text = [spendMessage(reason), spendMessage(reason, '2026-10'), refusalBody({ reason, period: '2026-10' }).error].join(' ');
    assert.doesNotMatch(text, /\$|dollar|\bUSD\b|per million|per MTok|1 credit =/i, reason);
  }
  assert.equal(spendMessage('allowance_exhausted', '2026-10'), 'Not enough AI credits. Renews on November 1, 12:00 AM UTC.');
  assert.equal(spendMessage('allowance_exhausted', '2026-12'), 'Not enough AI credits. Renews on January 1, 12:00 AM UTC.', 'year rollover');
});
