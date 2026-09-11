// Produce installable artifacts from an already-built private dashboard.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makePrivateTemplate } from './private-template.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!/^\d{12}$/.test(config.accountId) || config.region !== 'us-east-1'
    || !/^[A-Za-z][A-Za-z0-9-]{1,45}$/.test(config.stackName) || !/^[^\s"<>]+@[^\s"<>]+$/.test(config.ownerEmail)
    || !config.workspaceName || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(config.version)) throw new Error('Invalid installation configuration');
const output = resolve(root, '.small/byoc-private/releases', config.version);
if (existsSync(output)) throw new Error('This release version already exists; choose a new version');
const web = resolve(root, 'packages/web/dist-private');
if (!existsSync(join(web, 'index.html'))) throw new Error('Build the dashboard with VITE_PRIVATE_BYOC=true first');
const cli = process.argv[3];
if (config.jobs && (!cli || !existsSync(cli))) throw new Error('CPU releases require the CLI archive as the third argument');
mkdirSync(output, { recursive: true });
cpSync(web, join(output, 'web'), { recursive: true });
cpSync(fileURLToPath(new URL('./install-private.py', import.meta.url)), join(output, 'install-private.py'));
if (cli) cpSync(cli, join(output, 'small-deploy.tgz'));
const template = makePrivateTemplate({ ...config, apiCode: readFileSync(fileURLToPath(new URL('./private_api.py', import.meta.url)), 'utf8'),
  grantsCode: readFileSync(fileURLToPath(new URL('./grants.py', import.meta.url)), 'utf8'),
  ...(config.jobs ? { jobCode: readFileSync(fileURLToPath(new URL('./api.py', import.meta.url)), 'utf8'),
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
