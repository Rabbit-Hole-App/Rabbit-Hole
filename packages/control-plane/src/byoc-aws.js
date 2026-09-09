// AWS calls for connection metadata only. Customer data uses the customer's API.
const te = new TextEncoder();
const hex = (bytes) => [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, '0')).join('');
const hash = async (value) => hex(await crypto.subtle.digest('SHA-256', te.encode(value)));
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
async function hmac(key, value) {
  const imported = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, te.encode(value)));
}
async function signature(creds, region, service, date, value) {
  let key = te.encode('AWS4' + creds.SecretAccessKey);
  for (const part of [date.slice(0, 8), region, service, 'aws4_request']) key = await hmac(key, part);
  return hex(await hmac(key, value));
}
export const platformCredentials = (env) => ({ AccessKeyId: env.AWS_ACCESS_KEY_ID, SecretAccessKey: env.AWS_SECRET_ACCESS_KEY });

export async function awsCall(creds, region, service, path, body, { method = 'POST', host, contentType = 'application/json' } = {}) {
  host ||= `${service}.${region}.amazonaws.com`;
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const scope = `${date.slice(0, 8)}/${region}/${service}/aws4_request`;
  const headers = { 'content-type': contentType, host, 'x-amz-date': date, 'x-amz-content-sha256': await hash(body) };
  if (creds.SessionToken) headers['x-amz-security-token'] = creds.SessionToken;
  const names = Object.keys(headers).sort();
  const canonical = [method, path.split('/').map(enc).join('/'), '', names.map((k) => `${k}:${headers[k]}\n`).join(''), names.join(';'), headers['x-amz-content-sha256']].join('\n');
  const sig = await signature(creds, region, service, date, `AWS4-HMAC-SHA256\n${date}\n${scope}\n${await hash(canonical)}`);
  headers.Authorization = `AWS4-HMAC-SHA256 Credential=${creds.AccessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}`;
  const response = await fetch(`https://${host}${path}`, { method, headers, body, redirect: 'manual' });
  if (!response.ok) {
    const text = await response.text();
    // Expose only the AWS error code, never its echoed request or credentials.
    const code = text.match(/<Code>([A-Za-z0-9]+)<\/Code>/)?.[1] || 'RequestFailed';
    throw Object.assign(new Error(`AWS ${service} request failed (${response.status}: ${code})`), { status: 502 });
  }
  return response;
}

export async function templateUrl(env, key) {
  const creds = platformCredentials(env), region = env.BYOC_REGION;
  const host = `${env.BYOC_TEMPLATE_BUCKET}.s3.${region}.amazonaws.com`;
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const scope = `${date.slice(0, 8)}/${region}/s3/aws4_request`;
  const params = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${creds.AccessKeyId}/${scope}`,
    'X-Amz-Date': date, 'X-Amz-Expires': '3600', 'X-Amz-SignedHeaders': 'host' };
  const qs = Object.keys(params).sort().map((k) => `${enc(k)}=${enc(params[k])}`).join('&');
  const canonical = `GET\n/${key}\n${qs}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const sig = await signature(creds, region, 's3', date, `AWS4-HMAC-SHA256\n${date}\n${scope}\n${await hash(canonical)}`);
  return `https://${host}/${key}?${qs}&X-Amz-Signature=${sig}`;
}
