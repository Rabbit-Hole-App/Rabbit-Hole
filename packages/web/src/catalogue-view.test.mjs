import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogueMessage } from './tutor-rehearsal-text.js';
import { catalogueView } from './catalogue-view.js';

// The Tutor's catalogue message is one template for every codebase (owner 2026-11-15): short, numbered, a blank line between the parts, what is out of reach as a bullet list with one reason each.
const doc = {
  repo: 'karpathy/nanoGPT', hardware: 'cpu', summary: 'A small GPT training codebase.',
  routes: [
    { routeId: 'shakespeare_char_cpu', practical: true, recommended: true, title: 'Train a tiny Shakespeare model on CPU and read what it writes', effort: 'Quick — just Python', description: 'Downloads the Shakespeare text, trains a very small character-level GPT on the CPU and prints generated text.', stepsSketch: [] },
    { routeId: 'sample_pretrained_gpt2', practical: true, title: 'Give the pretrained GPT-2 a prompt and read its continuation', effort: 'Quick — just Python', description: 'Loads the smallest checkpoint.', stepsSketch: [] },
    { routeId: 'benchmark', practical: true, title: 'Time the GPT training step on your CPU', effort: 'Quick — just Python', description: 'Runs the core training iteration.', stepsSketch: [] },
    { routeId: 'gpu_full', practical: false, title: 'Train the full-size Shakespeare model and sample from it', effort: 'Heavy — needs a GPU', reason: 'Needs a GPU', stepsSketch: [] },
    { routeId: 'owt', practical: false, title: 'Reproduce GPT-2 training on OpenWebText', effort: 'Heavy — large download', reason: 'Needs a download of about 54 GB', stepsSketch: [] },
  ],
};

test('several practical ways: the repository, a numbered list with the star and one word of effort, then a bullet list of what is out of reach', () => {
  const { kind, text } = catalogueMessage(doc);
  assert.equal(kind, 'choose');
  assert.equal(text, [
    '**nanoGPT**: what you can do here',
    '1. ⭐ **Train a tiny Shakespeare model on CPU and read what it writes** · Quick\n2. **Give the pretrained GPT-2 a prompt and read its continuation** · Quick\n3. **Time the GPT training step on your CPU** · Quick',
    '**Not on this canvas**\n- Train the full-size Shakespeare model and sample from it: needs a GPU\n- Reproduce GPT-2 training on OpenWebText: needs a download of about 54 GB',
  ].join('\n\n'));
  assert.doesNotMatch(text, /Downloads the Shakespeare|Recommended to start|Here's what you can do with it/, 'no descriptions, no repeated phrases');
});

test('one practical way and none: the same template, short', () => {
  const one = catalogueMessage({ ...doc, routes: doc.routes.filter(r => r.routeId === 'shakespeare_char_cpu' || !r.practical) });
  assert.equal(one.kind, 'one');
  assert.match(one.text, /^\*\*nanoGPT\*\*: one way to use it on a CPU\n\n1\. ⭐ \*\*Train a tiny Shakespeare model on CPU and read what it writes\*\* · Quick\n\nSetting that up now\.\n\n\*\*Not on this canvas\*\*\n- /);
  const zero = catalogueMessage({ ...doc, routes: doc.routes.filter(r => !r.practical) });
  assert.equal(zero.kind, 'zero');
  assert.match(zero.text, /^\*\*nanoGPT\*\*: it can't run on this canvas\n\nA small GPT training codebase\.\n\n\*\*What it needs\*\*\n- /);
});

test('the view is the schema: name, hardware, numbered can, cannot with a reason', () => {
  const view = catalogueView(doc, 'nanoGPT');
  assert.deepEqual([view.name, view.hardware, view.can.map(c => c.n), view.can[0].recommended, view.cannot[0].reason], ['nanoGPT', 'CPU', [1, 2, 3], true, 'needs a GPU']);
});
