// Shared CLI/browser transport. Content goes only to the verified customer API.
export function createAwsClient(getGrant, expectedUrl) {
  let grant;
  return async function request(path, { method = 'GET', body } = {}, retry = true) {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid AWS path');
    if (!grant || grant.expires_at < Date.now() / 1000 + 15) grant = await getGrant();
    if (grant.api_url !== expectedUrl || !/^https:\/\/[a-z0-9]+\.lambda-url\.us-east-1\.on\.aws\/$/.test(expectedUrl)) throw new Error('AWS connection changed; reload and reconnect');
    const response = await fetch(expectedUrl.replace(/\/$/, '') + path, {
      method, credentials: 'omit', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + grant.token },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 401 && retry) { grant = null; return request(path, { method, body }, false); }
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || 'AWS request failed'), { status: response.status });
    return data;
  };
}
