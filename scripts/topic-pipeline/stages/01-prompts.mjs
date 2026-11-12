import { readFile, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { readJson, writeJson } from '../state.mjs';
import { validateTopic, validatePrompts, promptsSchema, kindCatalogue } from '../schemas.mjs';
import { callAgent } from '../agents/call.mjs';
import { fileExists } from '../agents/fixture-inputs.mjs';
import { toolPath } from '../tooling.mjs';

const execute = promisify(execFile);

export async function run(ctx) {
  const metadataPath = join(ctx.topicDir, 'topic.json');
  if (!await fileExists(metadataPath)) {
    const index = await readFile(await toolPath(ctx.config, 'slugIndex'), 'utf8');
    const rows = [...index.matchAll(/\[(\d{2})\s*[·.-]\s*([^\]]+)\]\((\d{2}-[a-z0-9-]+)\.md\)/g)]
      .filter(match => match[3].replace(/^\d{2}-/, '') === ctx.topic);
    if (!rows.length) throw new Error('Topic has no curriculum mapping. Supply topic.json with its source metadata.');
    const metadata = { topic: ctx.topic, title: rows[0][2], lessons: rows.map(row => row[1]),
      sources: rows.map(row => ({ kind: 'curriculum', path: ctx.config.sources.lessonPath.replace('<slug>', row[3]), revision: ctx.config.sources.revision })) };
    await writeJson(metadataPath, validateTopic(metadata));
  }
  const metadata = validateTopic(await readJson(metadataPath));
  if (metadata.topic !== ctx.topic) throw new Error('Topic metadata does not match the requested topic');
  const sources = [];
  for (const source of metadata.sources) {
    if (isAbsolute(source.path) || source.path.split(/[\\/]/).includes('..')) throw new Error('Source paths must be relative to their configured root');
    const root = source.kind === 'curriculum' ? ctx.config.paths.curriculumRoot : ctx.config.paths.sourceRoot;
    if (!root) throw new Error('Configure the source root in config.local.json');
    let text;
    if (source.kind === 'curriculum') {
      if (source.revision !== ctx.config.sources.revision) throw new Error('Curriculum source does not match the audited revision');
      ({ stdout: text } = await execute('git', ['show', `${source.revision}:${source.path}`], { cwd: root, maxBuffer: 4 * 1024 * 1024 }));
    } else {
      const path = await realpath(resolve(root, source.path));
      if (relative(await realpath(root), path).startsWith('..')) throw new Error('Source file escapes its configured root');
      text = await readFile(path, 'utf8');
    }
    sources.push({ ...source, text });
  }
  if (!sources.length) throw new Error('The topic requires at least one source');
  const validate = value => {
    validatePrompts(value);
    if (value.topic !== ctx.topic || value.prompts.some(row => row.lesson && !metadata.lessons.includes(row.lesson))) throw new Error('Generated prompt metadata differs from its topic');
    return value;
  };
  const result = await callAgent(ctx, 'prompt-writer', { topic: metadata, sources,
    catalogue: kindCatalogue.map(kind => ({ kind, description: `${kind} diagram supported by the renderer` })) }, { schema: promptsSchema, validate });
  validate(result);
  const path = join(ctx.topicDir, 'prompts.json');
  await writeJson(path, result);
  return { status: 'ok', artefacts: [path], notes: `${result.prompts.length} schema-valid prompts` };
}
