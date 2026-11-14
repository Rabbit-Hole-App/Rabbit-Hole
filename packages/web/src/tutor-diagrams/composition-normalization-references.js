import { derived } from './topic-normalization-data.js';
import manifest from './topic-embeddings-sources.json' with { type: 'json' };
const d = derived(), p = d.parameters, spec = diagram => ({ version: 1, diagram });
const tensor = rows => { const matrix = Array.isArray(rows[0]) ? rows : [rows];return { kind: 'tensor', tensor: { rows: matrix.length, columns: matrix[0].length, dimensions: matrix.length + ' × ' + matrix[0].length, values: matrix.flat() } }; };
const view = (row, overview = false, probe = false) => ({ kind: 'block-stack', title: probe ? 'Shift input, keep the supplied update fixed' : 'Add the residual, then normalize its sum',
  blocks: [...(overview ? [] : [{ id: 'inputs', label: 'Rows: x and supplied update u', diagram: tensor([row.display.input, row.display.update]) }]), { id: 'sum', label: '$s=x+u$', diagram: tensor(row.display.sum) }, { id: 'output', label: '$z=(s-\\mu)/\\sigma$', diagram: tensor(row.display.normalized), role: 'output' }],
  caption: overview ? `Toy $x=(${p.input})$, supplied $u=(${p.update})$. Add, then center/rescale with population moments; no epsilon or affine terms.`
    : probe ? `Fixed supplied u; $x'=x+${p.shift}$, $\\mu'=${row.display.mean},v'=${row.display.variance},\\sigma'=${row.display.std}$. Population recipe; no epsilon/affine. Same normalized output.`
      : `Toy population moments $\\mu=${row.display.mean},v=${row.display.variance},\\sigma=${row.display.std}$. Supplied update; no epsilon or affine gain/bias.` });
const entry = manifest.references.find(row => row.queueId === 'ml-normalization-residual-then-normalize');
const paraphrases = ['Show computed residual moments after adding a supplied update.', 'Normalize residual sums with the declared population variance.', 'Keep the supplied update fixed in a computed residual moments shift probe.', 'Which mean and variance normalize residual sums?', 'Show the unchanged normalized result after shifting inputs in computed residual moments.'];
const depths = { overview: { spec: spec(view(d.base, true)) }, standard: { spec: spec(view(d.base)) }, deep: { spec: spec(view(d.probe, false, true)) } };
export const references = Object.freeze([{ id: entry.referenceId, topic: entry.topic, lessons: entry.lessons, sources: [{ kind: 'figure-brief', path: entry.source.brief, revision: manifest.sourceRevision }], prompts: [entry.source.summary, ...paraphrases], paraphrases, keywords: ['computed residual moments', 'normalize residual sums'],
  useWhen: 'Compute residual addition and its explicit population moments; not regression residuals, branch-placement architecture, RMSNorm, implicit epsilon/affine terms or full-model width.', ...depths.standard, depths }]);
export { derived };
