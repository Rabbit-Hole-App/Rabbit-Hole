import test from 'node:test';
import assert from 'node:assert/strict';
import { RUNTIME_PACKAGES, unavailableImports } from './notebook-runtime.js';

test('the runtime list holds the standard library and the bundled packages, frozen', () => {
  for (const name of ['os', 'math', 'json', 'numpy', 'pandas', 'matplotlib', 'micropip']) assert.ok(RUNTIME_PACKAGES.includes(name), name);
  assert.ok(!RUNTIME_PACKAGES.includes('torch') && !RUNTIME_PACKAGES.includes('tkinter'));
  assert.ok(Object.isFrozen(RUNTIME_PACKAGES));
});

test('unavailableImports: top-level names the runtime lacks, in order, each once', () => {
  const code = [
    'import torch, numpy as np',
    'from transformers.models import x',
    'import torch.nn as nn',
    'import os.path; import jax',
  ].join('\n');
  assert.deepEqual(unavailableImports(code), ['torch', 'transformers', 'jax']);
});

test('unavailableImports: relative imports, __future__, local modules, comments and strings are not packages', () => {
  const code = [
    'from __future__ import annotations',
    'from . import sibling',
    'from .pkg import thing',
    'import helpers',
    '# import commented',
    's = "import quoted"',
    'doc = """',
    'import inside_docstring',
    '"""',
  ].join('\n');
  assert.deepEqual(unavailableImports(code, { local: ['helpers'] }), []);
  assert.deepEqual(unavailableImports('import helpers'), ['helpers']);
});

test('unavailableImports: indented, continued and parenthesised imports are read', () => {
  const code = [
    'try:',
    '    import jax',
    'except ImportError:',
    '    pass',
    'from flax import (',
    '    linen,',
    '    struct)',
    'import os, \\',
    '    einops',
  ].join('\n');
  assert.deepEqual(unavailableImports(code), ['jax', 'flax', 'einops']);
  assert.deepEqual(unavailableImports(''), []);
  assert.deepEqual(unavailableImports(null), []);
});
