// STS AssumeRole with hand-rolled SigV4 (no SDK in a Worker). The control plane's
// AWS principal (env.AWS_ACCESS_KEY_ID/SECRET) assumes customer roles; the customer's
// trust policy names this principal and pins sts:ExternalId to their small org.
const te = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256hex = async (s) => hex(await crypto.subtle.digest('SHA-256', te.encode(s)));

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, te.encode(data)));
}

export async function assumeRole(env, roleArn, sessionName, externalId) {
  const region = env.AWS_REGION || 'us-east-1';
  const host = `sts.${region}.amazonaws.com`;
  const body = new URLSearchParams({
    Action: 'AssumeRole',
    Version: '2011-06-15',
    RoleArn: roleArn,
    RoleSessionName: sessionName.replace(/[^\w+=,.@-]/g, '-').slice(0, 64),
    DurationSeconds: '3600',
    ExternalId: externalId,
  }).toString();

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const signedHeaders = 'content-type;host;x-amz-date';
  const canonical = `POST\n/\n\ncontent-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${amzDate}\n\n${signedHeaders}\n${await sha256hex(body)}`;
  const scope = `${date}/${region}/sts/aws4_request`;
  const toSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256hex(canonical)}`;
  let key = te.encode('AWS4' + env.AWS_SECRET_ACCESS_KEY);
  for (const part of [date, region, 'sts', 'aws4_request']) key = await hmac(key, part);
  const signature = hex(await hmac(key, toSign));

  const resp = await fetch(`https://${host}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Amz-Date': amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${env.AWS_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  });
  const text = await resp.text();
  if (!resp.ok) {
    const msg = (text.match(/<Message>([^<]*)<\/Message>/) || [])[1] || text.slice(0, 200);
    throw new Error(`sts assume role failed (${resp.status}): ${msg}`);
  }
  const g = (tag) => (text.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1];
  return { AccessKeyId: g('AccessKeyId'), SecretAccessKey: g('SecretAccessKey'), SessionToken: g('SessionToken'), Expiration: g('Expiration') };
}
