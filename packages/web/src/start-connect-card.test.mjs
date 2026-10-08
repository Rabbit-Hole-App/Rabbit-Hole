// The Start dialog's connect card (owner, 2026-10-08: "Start a rabbit hole from repo has the button Change and Cancel. Remove
// Change button"): Confirm and Cancel only; Cancel goes back to the repository field with the URL kept. The Agent Bar's cards
// keep Change, which puts the command back in the composer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('the Start dialog\'s connect card has no Change; Cancel clears the card and keeps the field; the bar keeps its Change', () => {
  const card = read('agent/ConfirmCard.jsx'), start = read('StartDialog.jsx');
  assert.match(card, /export default function ConfirmCard\(\{ card, onConfirm, onChange = null, onCancel \}\)/);
  assert.match(card, /\{onChange && <Button size="sm" onClick=\{onChange\}>Change<\/Button>\}/);
  const connect = start.slice(start.indexOf('<ConfirmCard'), start.indexOf('/>', start.indexOf('<ConfirmCard')));
  assert.doesNotMatch(connect, /onChange/);
  assert.match(connect, /onCancel=\{\(\) => setCard\(null\)\}/);
  // The URL field is outside the card and stays filled: Check repository comes back for another repository.
  assert.match(start, /<Input autoFocus inputMode="url" placeholder="https:\/\/github\.com\/owner\/repository" className="mt-1" \{\.\.\.field\('url'\)\} \/>/);
  assert.match(start, /\{!card && !choose && foot\('Check repository', !canSubmit\('repository', f\)\)\}/);
  assert.match(read('agent/ResultSheet.jsx'), /<ConfirmCard card=\{t\.card\} onConfirm=\{t\.confirm\} onChange=\{t\.change\} onCancel=\{t\.cancel\} \/>/);
});
