// Fly control from the worker. The org admin token (env.FLY_API_TOKEN) never
// leaves this process; the CLI only ever receives 1h app-scoped deploy tokens.
// Chosen over building from a tarball here: Fly has no build-from-tarball REST
// endpoint — remote builds speak the Docker/BuildKit protocol to a builder
// machine, which a Worker cannot. See docs/v3.
const MACHINES = 'https://api.machines.dev/v1';
const GQL = 'https://api.fly.io/graphql';

const authH = (env) => (env.FLY_API_TOKEN.startsWith('FlyV1') ? env.FLY_API_TOKEN : `Bearer ${env.FLY_API_TOKEN}`);

async function gql(env, query, variables) {
  const resp = await fetch(GQL, {
    method: 'POST',
    headers: { Authorization: authH(env), 'Content-Type': 'application/json' },
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
    headers: { Authorization: authH(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_name: flyApp, org_slug: env.FLY_ORG_SLUG || 'personal' }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    if (!/taken|already/i.test(text)) throw new Error(`fly app create failed (${resp.status}): ${text}`);
  }
  await gql(env, 'mutation($app: ID!) { allocateIpAddress(input: {appId: $app, type: shared_v4}) { app { name } } }', { app: flyApp });
}

let orgIdCache;
async function orgId(env) {
  if (!orgIdCache) {
    const { organizations } = await gql(env, 'query { organizations { nodes { id slug type } } }');
    const slug = env.FLY_ORG_SLUG || 'personal';
    const node = organizations.nodes.find((n) => n.slug === slug) || organizations.nodes.find((n) => n.type === 'PERSONAL');
    if (!node) throw new Error(`no fly org matching ${slug}`);
    orgIdCache = node.id;
  }
  return orgIdCache;
}

// The only Fly credential the CLI ever sees: deploy-scoped to one app, dead in 1h.
export async function mintDeployToken(env, flyApp) {
  const data = await gql(
    env,
    'mutation($input: CreateLimitedAccessTokenInput!) { createLimitedAccessToken(input: $input) { limitedAccessToken { tokenHeader } } }',
    { input: { name: `small-${flyApp}`, organizationId: await orgId(env), profile: 'deploy', profileParams: { app_id: flyApp }, expiry: '1h0m0s' } }
  );
  return data.createLimitedAccessToken.limitedAccessToken.tokenHeader;
}
