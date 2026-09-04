// Fly control from the worker. The org admin token (env.FLY_API_TOKEN) never
// leaves this process; the CLI only ever receives 1h app-scoped deploy tokens.
// Chosen over building from a tarball here: Fly has no build-from-tarball REST
// endpoint — remote builds speak the Docker/BuildKit protocol to a builder
// machine, which a Worker cannot. See docs/v3.
const MACHINES = 'https://api.machines.dev/v1';
const GQL = 'https://api.fly.io/graphql';

// Two credentials: FLY_ORG_TOKEN (long-lived org token) for app/IP/machine ops,
// FLY_API_TOKEN (short-lived user token) only for minting limited tokens —
// Fly rejects createLimitedAccessToken from org tokens (verified both dashboard-
// and flyctl-created). ponytail: user token's discharge expires in <1h, so
// minting (and thus deploys) needs a fresh one; offline macaroon attenuation of
// the org token would remove that — v4.
const authH = (token) => (token.startsWith('FlyV1') ? token : `Bearer ${token}`);
const machineToken = (env) => env.FLY_ORG_TOKEN || env.FLY_API_TOKEN;

async function gql(token, query, variables) {
  const resp = await fetch(GQL, {
    method: 'POST',
    headers: { Authorization: authH(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await resp.json();
  if (body.errors) throw new Error(`fly graphql: ${body.errors[0].message}`);
  return body.data;
}

// Create the Fly app + shared IPv4. Idempotent — rerun on every deploy.
export async function ensureFlyApp(env, flyApp) {
  const resp = await fetch(`${MACHINES}/apps`, {
    method: 'POST',
    headers: { Authorization: authH(machineToken(env)), 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_name: flyApp, org_slug: env.FLY_ORG_SLUG || 'personal' }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    if (!/taken|already/i.test(text)) throw new Error(`fly app create failed (${resp.status}): ${text}`);
  }
  await gql(machineToken(env), 'mutation($app: ID!) { allocateIpAddress(input: {appId: $app, type: shared_v4}) { app { name } } }', { app: flyApp });
}

// One volume per app, named "data" — [storage] in small.toml. Idempotent: reuse
// the existing volume (and its region) on redeploy. Volume and machine must share
// a region, so the caller pins the machine to the returned region.
// ponytail: single volume, single region; per-region volumes when multi-machine matters.
export async function ensureVolume(env, flyApp, sizeGb) {
  const headers = { Authorization: authH(machineToken(env)), 'Content-Type': 'application/json' };
  const list = await fetch(`${MACHINES}/apps/${flyApp}/volumes`, { headers });
  if (!list.ok) throw new Error(`fly volumes list failed (${list.status}): ${await list.text()}`);
  const existing = (await list.json()).find((v) => v.name === 'data');
  if (existing) return existing.region;
  // an app deployed before [storage] already has machines somewhere — put the volume with them
  let region = env.FLY_VOLUME_REGION || 'iad';
  const machines = await fetch(`${MACHINES}/apps/${flyApp}/machines`, { headers });
  if (machines.ok) {
    const ms = await machines.json();
    if (ms.length) region = ms[0].region;
  }
  const resp = await fetch(`${MACHINES}/apps/${flyApp}/volumes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'data', region, size_gb: sizeGb }),
  });
  if (!resp.ok) throw new Error(`fly volume create failed (${resp.status}): ${await resp.text()}`);
  return (await resp.json()).region;
}

let orgIdCache;
async function orgId(env) {
  if (env.FLY_ORG_ID) return env.FLY_ORG_ID; // pinned: skips a flaky orgs query on the aging user token
  if (!orgIdCache) {
    const { organizations } = await gql(env.FLY_API_TOKEN, 'query { organizations { nodes { id slug type } } }');
    const nodes = organizations.nodes.filter(Boolean);
    const slug = env.FLY_ORG_SLUG || 'personal';
    const node = nodes.find((n) => n.slug === slug) || nodes.find((n) => n.type === 'PERSONAL');
    if (!node) throw new Error(`no fly org matching ${slug}`);
    orgIdCache = node.id;
  }
  return orgIdCache;
}

// Start one machine for a job run. auto_destroy + restart "no": the machine
// runs the image's CMD to completion and Fly removes it.
export async function startMachine(env, flyApp, config) {
  const resp = await fetch(`${MACHINES}/apps/${flyApp}/machines`, {
    method: 'POST',
    headers: { Authorization: authH(machineToken(env)), 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  if (!resp.ok) throw new Error(`fly machine start failed (${resp.status}): ${await resp.text()}`);
  return resp.json();
}

// Kill a job run's machine. force: SIGKILL now — a stopped job machine has no
// graceful-shutdown value. 404 is fine: auto_destroy already removed it.
export async function destroyMachine(env, flyApp, machineId) {
  const resp = await fetch(`${MACHINES}/apps/${flyApp}/machines/${machineId}?force=true`, {
    method: 'DELETE',
    headers: { Authorization: authH(machineToken(env)) },
  });
  if (!resp.ok && resp.status !== 404) throw new Error(`fly machine destroy failed (${resp.status}): ${await resp.text()}`);
}

// The only Fly credential the CLI ever sees: deploy-scoped to one app.
// Minting requires the user token — org tokens get UNAUTHORIZED here — and user
// tokens' org authorization rots ~30min after `flyctl auth token`. So each app's
// token is minted ONCE at app creation (30 days) and stored in D1; deploys of
// existing apps never touch the user token again. ponytail: stored token = one
// app's creds at rest for 30d; offline macaroon attenuation of the org token
// (superfly/macaroon has no JS port yet) replaces this in v4.
export async function mintDeployToken(env, flyApp) {
  const data = await gql(
    env.FLY_API_TOKEN,
    'mutation($input: CreateLimitedAccessTokenInput!) { createLimitedAccessToken(input: $input) { limitedAccessToken { tokenHeader } } }',
    { input: { name: `small-${flyApp}`, organizationId: await orgId(env), profile: 'deploy', profileParams: { app_id: flyApp }, expiry: '720h0m0s' } }
  );
  return data.createLimitedAccessToken.limitedAccessToken.tokenHeader;
}

// Stored-token accessor: serve from D1, mint+store on miss.
export async function deployTokenFor(env, app) {
  if (app.deploy_token) return app.deploy_token;
  const token = await mintDeployToken(env, app.fly_app);
  await env.DB.prepare('UPDATE apps SET deploy_token = ? WHERE id = ?').bind(token, app.id).run();
  return token;
}
