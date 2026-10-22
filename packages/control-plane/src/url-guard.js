// The private-network guard for webpage captures (C:/s/spec/day-1021/webcard-interface.md section 5). Applied to the pasted
// URL, every redirect hop and every subresource the capture browser requests: http(s) on ports 80/443 only, no credentials,
// and the host must be public - an IP literal by itself, a name by every A and AAAA answer from DNS-over-HTTPS.
// Chromium resolves names on its own, so a DoH check cannot rule out DNS rebinding; it is defence in depth (the capture
// browser runs on Cloudflare's network, with no route to ours).

const DOH = 'https://cloudflare-dns.com/dns-query';

// [first address, prefix bits] of every non-public IPv4 range.
const V4_PRIVATE = [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]];

const v4num = ip => {
  const parts = ip.split('.');
  if (parts.length !== 4 || !parts.every(p => /^\d{1,3}$/.test(p) && +p <= 255)) return null;
  return parts.reduce((n, p) => n * 256 + +p, 0);
};
const inV4 = (n, [base, bits]) => Math.floor(n / 2 ** (32 - bits)) === Math.floor(v4num(base) / 2 ** (32 - bits));

// 8 numbers (16 bits each) or null.
function v6words(ip) {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const n = v4num(tail[1]);
    if (n === null) return null;
    s = s.slice(0, -tail[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const words = h => (h ? h.split(':') : []);
  const head = words(halves[0]), rest = halves.length === 2 ? words(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array(fill).fill('0'), ...rest];
  if (all.length !== 8 || !all.every(w => /^[0-9a-f]{1,4}$/.test(w))) return null;
  return all.map(w => parseInt(w, 16));
}

// True when an IP address (v4 or v6 text) is not a public unicast address. Anything unparseable counts as private.
export function isPrivateIp(ip) {
  const n = v4num(ip);
  if (n !== null) return V4_PRIVATE.some(range => inV4(n, range));
  const w = v6words(ip);
  if (!w) return true;
  if (w.every(x => x === 0)) return true;                                   // ::
  if (w.slice(0, 7).every(x => x === 0) && w[7] === 1) return true;         // ::1
  const embedded = () => `${w[6] >> 8}.${w[6] & 255}.${w[7] >> 8}.${w[7] & 255}`;
  if (w.slice(0, 5).every(x => x === 0) && (w[5] === 0xffff || w[5] === 0)) return isPrivateIp(embedded()); // ::ffff:a.b.c.d, ::a.b.c.d
  if (w[0] === 0x64 && w[1] === 0xff9b) return isPrivateIp(embedded());    // NAT64 64:ff9b::a.b.c.d
  if (w[0] === 0x2002) return isPrivateIp(`${w[1] >> 8}.${w[1] & 255}.${w[2] >> 8}.${w[2] & 255}`); // 6to4
  if ((w[0] & 0xfe00) === 0xfc00) return true;                              // fc00::/7 unique local
  if ((w[0] & 0xffc0) === 0xfe80 || (w[0] & 0xffc0) === 0xfec0) return true; // fe80::/10 link-local, fec0::/10 site-local
  if ((w[0] & 0xff00) === 0xff00) return true;                              // multicast
  if (w[0] === 0x2001 && w[1] === 0x0db8) return true;                      // documentation
  if (w[0] === 0x0100 && w.slice(1, 4).every(x => x === 0)) return true;    // discard-only 100::/64
  return false;
}

const isIpLiteral = host => v4num(host) !== null || host.startsWith('[') || host.includes(':');

// A name's A and AAAA answers through DoH: { ips } or { error: 'nxdomain' | 'dns' }. CNAME chains are followed by the resolver.
export async function resolveHost(host, fetcher = fetch) {
  const ips = [];
  for (const type of ['A', 'AAAA']) {
    let body;
    try {
      const res = await fetcher(`${DOH}?name=${encodeURIComponent(host)}&type=${type}`, { headers: { accept: 'application/dns-json' } });
      if (!res.ok) return { error: 'dns' };
      body = await res.json();
    } catch { return { error: 'dns' }; }
    if (body.Status === 3) return { error: 'nxdomain' };
    if (body.Status !== 0) return { error: 'dns' };
    for (const a of body.Answer || []) if (a.type === 1 || a.type === 28) ips.push(String(a.data));
  }
  return ips.length ? { ips } : { error: 'nxdomain' };
}

// Checks one URL. Returns { ok: true, url } or { ok: false, kind: 'blocked' | 'unavailable', reason }.
// cache: a Map shared across one capture, so each host resolves once.
export async function checkUrl(raw, { fetcher = fetch, cache = new Map() } = {}) {
  let url;
  try { url = new URL(String(raw).trim()); } catch { return { ok: false, kind: 'blocked', reason: 'This is not a web address.' }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, kind: 'blocked', reason: 'Only http and https pages can be captured.' };
  if (url.username || url.password) return { ok: false, kind: 'blocked', reason: 'Addresses with a user name or password cannot be captured.' };
  if (url.port && !['80', '443'].includes(url.port)) return { ok: false, kind: 'blocked', reason: 'Only pages on the standard web ports can be captured.' };
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') && !isIpLiteral(host)) {
    return { ok: false, kind: 'blocked', reason: 'Private network addresses cannot be captured.' };
  }
  if (isIpLiteral(host)) return isPrivateIp(host) ? { ok: false, kind: 'blocked', reason: 'Private network addresses cannot be captured.' } : { ok: true, url: url.href };
  if (!cache.has(host)) cache.set(host, resolveHost(host, fetcher));
  const found = await cache.get(host);
  if (found.error) return { ok: false, kind: 'unavailable', reason: found.error === 'nxdomain' ? 'This site could not be found.' : 'This site could not be reached.' };
  if (found.ips.some(isPrivateIp)) return { ok: false, kind: 'blocked', reason: 'Private network addresses cannot be captured.' };
  return { ok: true, url: url.href };
}

// A subresource or navigation inside the capture browser: data: and blob: never touch the network, about:blank is empty.
export async function checkRequest(raw, opts) {
  if (/^(data|blob):/i.test(raw) || raw === 'about:blank') return { ok: true, url: raw };
  return checkUrl(raw, opts);
}
