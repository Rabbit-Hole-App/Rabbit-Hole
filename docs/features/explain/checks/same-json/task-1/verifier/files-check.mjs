// per .md: bytes, CR count, lone CR, final newline count, BOM, tabs, trailing spaces, first line, generated entry equal to rule text, sha equal
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = process.argv[2];
const dir = root + '/packages/control-plane/src/prompts/explanation/';
const gen = (await import('file:///' + root + '/packages/control-plane/src/explanation-prompts.generated.js')).EXPLANATION_PROMPT_FILES;
for (const f of readdirSync(dir).sort()) {
  const buf = readFileSync(dir + f); const s = buf.toString('utf8');
  const cr = (s.match(/\r/g) || []).length, crlf = (s.match(/\r\n/g) || []).length;
  let nl = 0; for (let i = s.length - 1; i >= 0 && (s[i] === '\n' || s[i] === '\r'); i--) nl++;
  const rule = s.replace(/\r\n/g, '\n').replace(/\n$/, '');
  const g = gen[f];
  console.log(f.padEnd(34), 'bytes', buf.length, 'chars', s.length, 'CR', cr, 'CRLF', crlf, 'trailing nl/cr run', nl, 'BOM', buf[0] === 0xEF && buf[1] === 0xBB, 'ruleChars', rule.length, 'gen==rule', g?.text === rule, 'sha ok', g?.sha256 === createHash('sha256').update(rule).digest('hex'), 'nonASCII', (s.match(/[^\x00-\x7f]/g) || []).length, 'lastChar', JSON.stringify(rule.slice(-12)));
}
console.log('generated keys', Object.keys(gen).join(' '));
