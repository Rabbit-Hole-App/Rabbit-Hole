import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { tokenizeMath } from '../math-tokens.js';
import { references } from './ml-batch3-teaching-references.js';
import { parseTutorDiagram, tutorDiagramVisibleText } from './spec.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const expected = [
  ['ml-transformer-attention', 'matrix', 'how does attention work in a transformer?'],
  ['ml-rag-retrieval', 'sequence', 'how does RAG work?'],
  ['ml-cpu-vs-gpu', 'comparison', 'what is the difference between a CPU and a GPU?'],
  ['ml-dropout-network', 'transformation', 'how does dropout work?'],
  ['ml-diffusion-denoising', 'sequence', 'how does a diffusion model generate an image?'],
  ['ml-kv-cache-decode', 'sequence', 'how does KV caching speed up inference?'],
  ['ml-robot-arm-pickup', 'flow', 'how does a robot arm pick up an object?'],
];

function diagramFor(id) {
  const reference = references.find(entry => entry.id === id);
  assert.ok(reference, id);
  return parseTutorDiagram(reference.spec).diagram;
}

test('the seven reference prompts round-trip and render at narrow and wide card widths', () => {
  assert.equal(references.length, expected.length);
  for (const [id, kind, prompt] of expected) {
    const reference = references.find(entry => entry.id === id);
    assert.ok(reference, id);
    assert.deepEqual(reference.lessons, []);
    assert.ok(reference.prompts.includes(prompt), prompt);
    const saved = JSON.stringify(reference.spec);
    const spec = parseTutorDiagram(saved);
    assert.deepEqual(spec, reference.spec);
    assert.equal(spec.diagram.kind, kind);

    const formulas = new Set(tutorDiagramVisibleText(spec).flatMap(text => tokenizeMath(text).math.map(entry => entry.raw)));
    for (const available of [320, 408, 720]) {
      const { element, width, height } = renderTutorDiagram(saved, available);
      const markup = renderToStaticMarkup(element);
      const where = `${id} at ${available}px`;
      assert.equal(element.type, 'svg', where);
      assert.equal(element.props['data-tutor-diagram'], kind, where);
      assert.equal(element.props.viewBox, `0 0 ${width} ${height}`, where);
      assert.ok(Number.isFinite(width) && width >= available && Number.isFinite(height) && height > 0, where);
      assert.doesNotMatch(markup, /NaN|Infinity|undefined|katex-error/, where);
      const renderedFormulas = new Set([...markup.matchAll(/data-tutor-tex="([^"]*)"/g)].map(match => match[1]));
      assert.deepEqual(renderedFormulas, formulas, where);
    }
  }
});

test('transformer attention normalizes each query and mixes the matching key values', () => {
  const { columns, rows, caption } = diagramFor('ml-transformer-attention');
  assert.deepEqual(columns, ['Key “red”', 'Key “bird”']);
  assert.deepEqual(rows.map(row => row.heading), ['Query “red”', 'Query “bird”']);
  assert.match(caption, /softmax.*row.*\$1\$/i);
  const values = [...caption.matchAll(/\$v_[12]=\((\d+),(\d+)\)\$/g)].map(match => match.slice(1).map(Number));
  const mixes = [...caption.matchAll(/\$([\d.]+)v_1\+([\d.]+)v_2=\(([\d.]+),([\d.]+)\)\$/g)]
    .map(match => match.slice(1).map(Number));
  assert.deepEqual(values, [[2, 0], [0, 4]]);
  assert.equal(mixes.length, rows.length);
  for (const [index, { cells }] of rows.entries()) {
    const weights = cells.map(cell => Number(cell.slice(1, -1)));
    assert.ok(weights.every(weight => weight > 0 && weight < 1));
    assert.equal(weights[0] + weights[1], 1);
    const [firstWeight, secondWeight, ...result] = mixes[index];
    assert.deepEqual([firstWeight, secondWeight], weights);
    assert.deepEqual(result, values[0].map((component, j) => firstWeight * component + secondWeight * values[1][j]));
  }
});

test('RAG retrieves source passages and sends them with the question to ground the answer', () => {
  const { actors, messages, caption } = diagramFor('ml-rag-retrieval');
  assert.deepEqual(actors.map(actor => actor.label), ['User', 'App', 'Retriever / vector store', 'LLM']);
  assert.deepEqual(messages.map(({ from, to }) => [from, to]), [
    ['user', 'app'], ['app', 'retriever'], ['retriever', 'app'], ['app', 'llm'], ['llm', 'app'], ['app', 'user'],
  ]);
  assert.match(messages[0].label, /When does the museum close\?/);
  assert.match(messages[1].label, /question.*embed.*search/i);
  assert.match(messages[2].label, /top passages.*closes at 5 pm/i);
  assert.match(messages[3].label, /prompt.*question.*top passages/i);
  assert.match(messages[4].label, /5 pm.*source passage/i);
  assert.match(messages[5].label, /5 pm.*source/i);
  assert.match(caption, /vector similarity/);
});

test('CPU and GPU columns compare core design, performance goal and workload in order', () => {
  const { columns } = diagramFor('ml-cpu-vs-gpu');
  assert.deepEqual(columns.map(column => column.heading), ['CPU', 'GPU']);
  const [cpu, gpu] = columns.map(column => column.items);
  assert.equal(cpu.length, gpu.length);
  assert.match(cpu[0], /few large.*cores/i);
  assert.match(gpu[0], /thousands of small.*cores/i);
  assert.match(cpu[1], /low latency/i);
  assert.match(gpu[1], /high throughput/i);
  assert.match(cpu[2], /sequential/i);
  assert.match(gpu[2], /parallel/i);
});

test('a dropout mask preserves the hidden unit IDs and deactivates both sides of the sampled unit', () => {
  const { operation, before, after, identity, caption } = diagramFor('ml-dropout-network');
  assert.match(operation, /randomly mask hidden units during training/i);
  assert.equal(identity.mode, 'preserved');
  assert.deepEqual(before.diagram.columns, ['Input links from', 'Output link to']);
  assert.deepEqual(after.diagram.columns, before.diagram.columns);
  assert.deepEqual(before.diagram.rows.map(row => row.id), ['h1', 'h2', 'h3']);
  assert.deepEqual(before.diagram.rows.map(row => row.cells), Array.from({ length: 3 }, () => ['$x_1,x_2$', '$y$']));
  assert.deepEqual(after.diagram.rows.filter(row => row.id !== 'h2'), before.diagram.rows.filter(row => row.id !== 'h2'));
  const masked = after.diagram.rows.find(row => row.id === 'h2');
  assert.match(masked?.heading, /\$h_2\$ off/);
  assert.deepEqual(masked.cells, ['Removed', 'Removed']);
  assert.match(caption, /classical dropout.*all units at inference.*keep rate \$p\$/i);
  assert.match(caption, /\$h_i\\mapsto ph_i\$/);
});

test('diffusion passes the prompt embedding and noisy samples into the denoiser before returning the image', () => {
  const { messages, caption } = diagramFor('ml-diffusion-denoising');
  assert.deepEqual(messages.map(({ from, to }) => [from, to]), [
    ['app', 'denoiser'], ['sampler', 'denoiser'], ['denoiser', 'sampler'], ['sampler', 'denoiser'],
    ['denoiser', 'sampler'], ['sampler', 'app'],
  ]);
  assert.match(messages[0].label, /prompt embedding/i);
  assert.match(messages[1].label, /pure noise \$x_T\$/i);
  assert.match(messages[2].label, /noise.*prompt/i);
  assert.match(messages[3].label, /less noisy \$x_\{T-1\}\$/i);
  assert.match(messages[4].label, /noise prediction/i);
  assert.match(messages[5].label, /clean image \$x_0\$ after \$T\$ steps/i);
  assert.match(caption, /remove.*noise.*each step/i);
  assert.match(caption, /training.*adds noise to clean images/i);
});

test('KV caching projects only the new token at two consecutive decode steps', () => {
  const { messages, caption } = diagramFor('ml-kv-cache-decode');
  assert.equal(messages.length, 8);
  const expressions = label => tokenizeMath(label).math.map(entry => entry.expression);
  for (const [index, step] of ['t', 't+1'].entries()) {
    const subscript = index === 0 ? step : `{${step}}`;
    const [project, append, read, next] = messages.slice(index * 4, index * 4 + 4);
    assert.deepEqual([project.from, project.to], ['decoder', 'attention']);
    assert.match(project.label, /project only token/i);
    assert.deepEqual(expressions(project.label), [step, `q_${subscript}`, `k_${subscript}`, `v_${subscript}`]);
    assert.deepEqual([append.from, append.to], ['attention', 'cache']);
    assert.match(append.label, /append.*read cache/i);
    assert.deepEqual(expressions(append.label), [`k_${subscript}`, `v_${subscript}`]);
    assert.deepEqual([read.from, read.to], ['cache', 'attention']);
    assert.match(read.label, /all keys.*values/i);
    assert.deepEqual(expressions(read.label), [String.raw`K_{\le ${step}}`, String.raw`V_{\le ${step}}`]);
    assert.deepEqual([next.from, next.to], ['attention', 'decoder']);
    assert.match(next.label, /context.*next-token prediction/i);
  }
  assert.match(caption, /new query.*cached keys and values/i);
  assert.match(caption, /saves projecting past tokens again/i);
});

test('robot pickup follows the successful path from camera sensing through grip verification', () => {
  const { nodes, edges } = diagramFor('ml-robot-arm-pickup');
  assert.deepEqual(nodes.map(node => node.id), ['sense', 'plan', 'move', 'close', 'lift', 'verify']);
  assert.deepEqual(edges.map(({ from, to }) => [from, to]), nodes.slice(1).map((node, i) => [nodes[i].id, node.id]));
  const expectedLabels = [/^Find.*camera/, /^Plan.*grasp pose/, /^Move.*joints/, /^Close.*gripper/, /^Lift.*object/, /^Verify.*grip/];
  nodes.forEach((node, i) => assert.match(node.label, expectedLabels[i]));
  assert.equal(nodes.at(-1).role, 'outcome');
});
