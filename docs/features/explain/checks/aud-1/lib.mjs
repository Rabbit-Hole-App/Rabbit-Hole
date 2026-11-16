import fs from 'node:fs';
const ENV = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env';
export function key(name) {
  const line = fs.readFileSync(ENV, 'utf8').split('\n').find(l => l.startsWith(name + '='));
  if (!line) throw new Error('missing ' + name);
  return line.slice(name.length + 1).replace(/\r$/, '').trim().replace(/^["']|["']$/g, '');
}
export const redact = (s, keys) => keys.reduce((a, k) => k ? a.split(k).join('[KEY]') : a, String(s));
