import test from 'node:test';
import assert from 'node:assert/strict';
import { checkD1Limits, D1_LIMITS } from './d1-limits.js';
import { learnDb } from './learn-grade-fixture.js';

const refuses = (sql, args, pattern) => assert.throws(() => checkD1Limits(sql, args), pattern);

test('a LIKE pattern over 50 bytes is refused, at 50 it passes (anonymous, numbered, literal, NOT LIKE, GLOB)', () => {
  const ok = 'a'.repeat(50), long = 'a'.repeat(51);
  checkD1Limits('SELECT 1 WHERE x LIKE ?', [ok]);
  refuses('SELECT 1 WHERE x LIKE ?', [long], /pattern is 51 bytes/);
  refuses('SELECT 1 WHERE y = ? AND x LIKE ?', ['short', long], /pattern is 51 bytes/);
  checkD1Limits('SELECT 1 WHERE y = ? AND x LIKE ?', [long, ok]); // the long value is not the pattern
  refuses('SELECT 1 WHERE x NOT LIKE ?2', ['k', long], /pattern is 51/);
  checkD1Limits('SELECT 1 WHERE x LIKE ?2', [long, ok]);
  refuses('SELECT 1 WHERE x GLOB ?', [long], /pattern is 51/);
  refuses(`SELECT 1 WHERE x LIKE '${long}'`, [], /pattern is 51/);
  checkD1Limits("SELECT 1 WHERE x LIKE 'a?b' AND y = ?", ['k']); // a ? inside a literal is not a placeholder
});

test('the pattern is measured in bytes, not characters', () => {
  checkD1Limits('SELECT 1 WHERE x LIKE ?', ['é'.repeat(25)]); // 50 bytes
  refuses('SELECT 1 WHERE x LIKE ?', ['é'.repeat(26)], /52 bytes/);
});

test('more than 100 bound parameters, a statement over 100 KB, a value over 2 MB', () => {
  const marks = n => Array(n).fill('?').join(',');
  checkD1Limits(`SELECT ${marks(100)}`, Array(100).fill(1));
  refuses(`SELECT ${marks(101)}`, Array(101).fill(1), /101 bound parameters/);
  refuses('SELECT ?101', [], /101 bound parameters/);
  checkD1Limits(`SELECT '${'x'.repeat(D1_LIMITS.statementBytes - 20)}'`);
  refuses(`SELECT '${'x'.repeat(D1_LIMITS.statementBytes)}'`, [], /over the 100000 byte limit/);
  refuses('SELECT ?', ['x'.repeat(D1_LIMITS.valueBytes + 1)], /byte row limit/);
});

test('the shared learnDb stand-in applies the limits when a statement is bound', t => {
  const { LEARN_DB } = learnDb(t, 'CREATE TABLE k (v TEXT)');
  LEARN_DB.prepare('SELECT * FROM k WHERE v LIKE ?').bind('a'.repeat(50));
  assert.throws(() => LEARN_DB.prepare('SELECT * FROM k WHERE v LIKE ?').bind('a'.repeat(51)), /pattern is 51 bytes/);
});
