t = open('run.mjs', encoding='utf8').read()
i = t.index("if (a['dry-run']) {")
j = t.index("const only = a.only")
dry = r'''if (a['dry-run']) {
  // No provider call: validates the plan, that both trees import, that the harness helpers (ledger, diagram parser, card checks) work, the BENCH-1 regex, and the offline variation check.
  const bad = plan.items.filter(it => !it.prompt || !['brief', 'balanced', 'detailed'].includes(it.depth) || !Number.isInteger(it.idx));
  const numeric = plan.items.filter(it => !it.arms || it.arms.length === 2), vary = plan.items.filter(it => it.set === 'vary');
  if (bad.length || new Set(plan.items.map(it => it.idx)).size !== plan.items.length || numeric.length !== 303 || vary.length !== 20) { console.error('plan is not 303 numeric items + 20 variation items', plan.items.length, bad.length); process.exit(2); }
  assertRegex();
  for (const arm of ARMS) {
    const T = trees[arm], { sqlite } = ledger(arm);
    sqlite.prepare('SELECT count(*) AS n FROM usage_attempts').get(); sqlite.close();
    for (const it of plan.items) { const v = T.deriveVisualRequirements(T.requirementText({ args: it.prompt })); void v; }
    const src = fs.readFileSync(`${a.trees}/${arm}/packages/control-plane/src/learn-artifact.js`, 'utf8');
    console.log(arm, 'imports ok; generateArtifact', typeof T.generateArtifact, '| requestSeed in the build:', src.includes('requestSeed'), '| tokensFilled in the build:', src.includes('tokensFilled'));
  }
  // offline variation check on the AFTER tree: the same prompt with two seeds draws different varied inputs of the same reference (what the paid variation runs then look for in the cards)
  if (trees.after) {
    const imp = f => import(pathToFileURL(`${a.trees}/after/packages/${f}`).href);
    const { prepareArtifactAuthorRequest } = await imp('control-plane/src/learn-artifact.js');
    const { diagramReferences } = await imp('web/src/tutor-diagrams/reference-library.js');
    const at = (root, path) => path.split('.').reduce((node, key) => node?.[key], root);
    const penv = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
    const quiet = f => { const log = console.log; console.log = () => {}; try { return f(); } finally { console.log = log; } };
    const ids = [...new Set(vary.map(v => v.refId))];
    for (const id of ids) {
      const ref = diagramReferences.find(r => r.id === id), prompt = vary.find(v => v.refId === id).prompt;
      const spec = seed => quiet(() => prepareArtifactAuthorRequest(penv, { command: 'explanation', args: prompt, depth: 'standard', requestSeed: seed })).diagramReferences.find(r => r.id === id)?.spec?.diagram;
      const s1 = spec('bench-1000-1'), s2 = spec('bench-1000-2');
      const changed = Object.keys(ref.vary).filter(p => at(s1, p) !== at(s2, p));
      if (!s1 || !s2 || !changed.length) { console.error(`variation check failed offline for ${id}`); process.exit(2); }
      console.log(`  vary ok ${id}: ${changed.length} of ${Object.keys(ref.vary).length} varied paths differ between two seeds`);
    }
  }
  const runs = numeric.length * ARMS.length + vary.length, PER_RUN_UPPER = 0.0034; // section 6: US$2.07 upper bound over 606 runs = US$0.0034 a run
  console.log(`plan ok: ${numeric.length} numeric items x ${ARMS.length} arms + ${vary.length} variation runs = ${runs} runs; est. US$${(runs * PER_RUN_UPPER).toFixed(2)} (US$${PER_RUN_UPPER} a run, section-6 upper bound; the AFTER arm adds a guidance sentence of about 45 words only on diagram plans) vs stop line US$${a.cap} and hard cap US$6.00; key names present: ${NAMES.join(', ')}; NO provider call made`);
  process.exit(0);
}
'''
t = t[:i] + dry + t[j:]
old = r"const COLS_OBJECT = /columns\.\d+: Invalid input: expected string, received object/;"
assert old in t
t = t.replace(old, old + "\nconst assertRegex = () => { if (!COLS_OBJECT.test('diagram.columns.0: Invalid input: expected string, received object') || COLS_OBJECT.test('columnsd+: Invalid input: expected string, received object')) { console.error('BENCH-1: the columns-object regex lost its backslashes'); process.exit(2); } console.log('BENCH-1 regex self-test ok'); };", 1)
old2 = "  const k = item.idx % ARMS.length, arms = [...ARMS.slice(k), ...ARMS.slice(0, k)];"
assert old2 in t
t = t.replace(old2, "  const pool = item.arms ? ARMS.filter(x => item.arms.includes(x)) : ARMS, k = item.idx % pool.length, arms = [...pool.slice(k), ...pool.slice(0, k)];", 1)
old3 = "${item.idx} ${arm} c${item.cell} ${item.depth}"
assert old3 in t
t = t.replace(old3, "${item.idx} ${arm} ${item.set} ${item.depth}", 1)
open('run.mjs', 'w', encoding='utf8', newline='').write(t)
print('patched')
