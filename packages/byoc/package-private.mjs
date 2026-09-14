// Produce installable artifacts from an already-built private dashboard.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { makePrivateTemplate } from './private-template.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const LIVE_CONFIRMATION = 'DEPLOY LIVE';

export function parseCommand(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    target: { type: 'string' }, confirm: { type: 'string' },
  } });
  if (!values.target) throw new Error('Specify --target dev or --target live');
  if (!['dev', 'live'].includes(values.target)) throw new Error('--target must be dev or live');
  if (values.target === 'live' && values.confirm !== LIVE_CONFIRMATION) {
    throw new Error('Live packaging requires --confirm "DEPLOY LIVE"');
  }
  if (!positionals[0] || positionals.length > 3) {
    throw new Error('Usage: package-private.mjs --target dev|live [--confirm "DEPLOY LIVE"] <config.json> [cli.tgz] [web-dir]');
  }
  return { target: values.target, configPath: positionals[0], cliPath: positionals[1], webPath: positionals[2] };
}

export function validateConfigTarget(config, target) {
  if (config.target !== target) throw new Error('The configuration target must match --target');
}

function packageRelease(command) {
  const config = JSON.parse(readFileSync(command.configPath, 'utf8'));
  validateConfigTarget(config, command.target);
  if (!/^\d{12}$/.test(config.accountId) || config.region !== 'us-east-1'
      || !/^[A-Za-z][A-Za-z0-9-]{1,45}$/.test(config.stackName) || !/^[^\s"<>]+@[^\s"<>]+$/.test(config.ownerEmail)
      || !config.workspaceName || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(config.version)) throw new Error('Invalid installation configuration');
  const output = resolve(root, '.small/byoc-private/releases', config.version);
  if (existsSync(output)) throw new Error('This release version already exists; choose a new version');
  // Image/backend-only updates can reuse the exact installed dashboard artifact.
  const web = command.webPath ? resolve(command.webPath) : resolve(root, 'packages/web/dist-private');
  if (!existsSync(join(web, 'index.html'))) throw new Error('Build the dashboard with VITE_PRIVATE_BYOC=true first');
  const cli = command.cliPath;
  if (config.jobs && (!cli || !existsSync(cli))) throw new Error('CPU releases require the CLI archive after the configuration');
  mkdirSync(output, { recursive: true });
  cpSync(web, join(output, 'web'), { recursive: true });
  cpSync(fileURLToPath(new URL('./install-private.py', import.meta.url)), join(output, 'install-private.py'));
  if (cli) cpSync(cli, join(output, 'small-deploy.tgz'));
  const template = makePrivateTemplate({ ...config, apiCode: readFileSync(fileURLToPath(new URL('./private_api.py', import.meta.url)), 'utf8'),
    grantsCode: readFileSync(fileURLToPath(new URL('./grants.py', import.meta.url)), 'utf8'),
    chatCode: readFileSync(fileURLToPath(new URL('./private_chat.py', import.meta.url)), 'utf8'),
    ...(config.jobs ? { jobCode: readFileSync(fileURLToPath(new URL('./api.py', import.meta.url)), 'utf8'),
      cleanupCode: readFileSync(fileURLToPath(new URL('./image_cleanup.py', import.meta.url)), 'utf8'),
      permissionsCode: readFileSync(fileURLToPath(new URL('./permissions.py', import.meta.url)), 'utf8') } : {}) });
  writeFileSync(join(output, 'template.json'), JSON.stringify(template));
  const sha256 = {};
  function hashFiles(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isDirectory()) hashFiles(path);
      else sha256[relative(output, path).split(sep).join('/')] = createHash('sha256').update(readFileSync(path)).digest('hex');
    }
  }
  hashFiles(output);
  writeFileSync(join(output, 'release.json'), JSON.stringify({ version: config.version, installation: config, sha256 }, null, 2));
  console.log(output);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  packageRelease(parseCommand(process.argv.slice(2)));
}
