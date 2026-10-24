// The Start dialog's checked repository (owner, 2026-10-08: "Start a rabbit hole from repo has the button Change and Cancel. Remove
// Change button"; reshaped by the combined-sources brief 2026-10-23): nothing is created from the dialog, so the checked
// repository is added to the list with Add repository and Cancel only; Cancel goes back to the field with the URL kept (a bare input is hidden), and the source list stays. The
// Agent Bar's cards keep Change, which puts the command back in the composer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test("the Start dialog's checked repository has no Change; Cancel goes back to the field with the URL kept and the list stays; the bar keeps its Change", () => {
  const card = read('agent/ConfirmCard.jsx'), start = read('StartDialog.jsx');
  assert.match(card, /export default function ConfirmCard\(\{ card, onConfirm, onChange = null, onCancel \}\)/);
  assert.match(card, /\{onChange && <Button size="sm" onClick=\{onChange\}>Change<\/Button>\}/);
  assert.doesNotMatch(start, /ConfirmCard|Change</);
  // The URL field stays filled and Check repository comes back for another repository; Add repository only adds to the list.
  assert.match(start, /<Input autoFocus inputMode="url" placeholder="https:\/\/github\.com\/owner\/repository" className="mt-1" value=\{url\}/);
  assert.match(start, /\{!card && !choose && <Button type="submit" variant="primary" disabled=\{busy \|\| !url\.trim\(\)\}>.*Check repository<\/Button>\}/);
  assert.match(start, /<Button type="button" variant="secondary" onClick=\{cancel\}>Cancel<\/Button>/);
  assert.match(start, /const cancel = \(\) => \{ if \(card \|\| choose\) \{ setCard\(null\); setChoose\(null\); \} else hide\(\); \};/);
  assert.match(start, /<Button variant="primary" disabled=\{busy \|\| card\.prepared\.policy\.blocked\} onClick=\{addRepository\}>Add repository<\/Button>/);
  const add = start.slice(start.indexOf('const addRepository'), start.indexOf('// ---- start'));
  assert.doesNotMatch(add, /executeCommand|connect_repository/); // nothing is created from the dialog
  assert.match(read('agent/ResultSheet.jsx'), /<ConfirmCard card=\{t\.card\} onConfirm=\{t\.confirm\} onChange=\{t\.change\} onCancel=\{t\.cancel\} \/>/);
});
