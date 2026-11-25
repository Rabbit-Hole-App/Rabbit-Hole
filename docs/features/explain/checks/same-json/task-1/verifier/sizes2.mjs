// own segmentation: assembled system text of the top-k request on three trees; per-part sizes (heading included, joining blank line excluded) and sha1 of every part
import { createHash } from 'node:crypto';
const roots = { ab40: 'C:/s/sj-text-out/ab40', main: 'C:/s/sj-text-out/main', branch: 'C:/s/sj-verify2/tip' };
const question = 'Does top-k filtering affect the reported probability of the chosen token?';
const realLog = console.log;
const out = {};
for (const [arm, root] of Object.entries(roots)) {
  const imp = p => import('file:///' + root + '/packages/control-plane/' + p);
  console.log = () => {};
  const [art, pl, fc] = await Promise.all([imp('src/learn-artifact.js'), imp('src/explanation-planner.js'), imp('src/explanation-fast-chain.js')]);
  const env = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', EXPLANATION_PLANNER: 'jev', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', TYPESAFE_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
  const answers = { visualType: { choice: 'diagram', confidence: 0.95 }, kind: { choice: 'bar-chart', confidence: 0.9, probabilities: { 'bar-chart': 0.9, flow: 0.05 } }, depthTreatment: { choice: 'mechanism' }, isPhysical: { noul: 0.05 } };
  const results = {};
  for (const [label, plan] of [['planned', pl.planFromAnswers(answers, 'balanced')], ['unplanned', null]]) {
    const input = art.planWithReferenceKind({ command: 'explanation', args: question, selection: null, context: null, depth: 'balanced', requestSeed: 'v-1', ...(plan ? { plan } : {}) });
    const body = art.prepareArtifactAuthorRequest(env, input).body;
    const t = fc.assembledSystem(body);
    const marks = ['# Card layout', '# Numbers and maths', '# Diagram kinds and their fields', 'Based on the rules above, this card:', '# Depth', plan ? '# Visuals for this card' : '# Visuals for this card', '# Examples', '# Output format'];
    const at = marks.map(m => t.indexOf('\n' + m + '\n') >= 0 ? t.indexOf('\n' + m + '\n') + 1 : -1);
    if (at.some(i => i < 0)) throw new Error(`${arm} ${label}: part missing ${marks.filter((m, i) => at[i] < 0)}`);
    const cuts = [0, ...at, t.length];
    const names = ['1 opening', '2 card layout', '3 numbers+maths', '4 diagram kinds', 'line', '5 depth', '6 visuals', '7 examples', '8 output format'];
    const parts = names.map((n, i) => { const s = t.slice(cuts[i], cuts[i + 1]).replace(/\n\n$/, ''); return [n, s.length, createHash('sha1').update(s).digest('hex').slice(0, 8)]; });
    results[label] = { parts, total: t.length, desc: body.tools[0].description.length, sha: createHash('sha1').update(t).digest('hex').slice(0, 10), systemLen: [].concat(body.system).join('\n').length };
  }
  out[arm] = results;
  console.log = realLog;
}
for (const label of ['planned', 'unplanned']) {
  realLog('==', label);
  for (const arm of Object.keys(out)) realLog(arm.padEnd(7), out[arm][label].parts.map(([n, s]) => `${n.split(' ')[0]}:${s}`).join(' '), '| total', out[arm][label].total, 'tool desc', out[arm][label].desc, 'sha', out[arm][label].sha);
  for (const arm of ['main', 'branch']) realLog(`part shas ${arm} == ab40:`, out[arm][label].parts.map(([, , h], i) => h === out.ab40[label].parts[i][2]).join(','), 'total sha equal', out[arm][label].sha === out.ab40[label].sha);
}
