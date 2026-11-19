// derives run.mjs (GEN-1 R2 bench) from the R1 harness: trees, plan, cap, roadmap items (authorInput + quoteRoadmapCard of each tree, repairs 0), seeded-example trace fields
import fs from 'node:fs';
let s = fs.readFileSync('C:/s/sprint2-evidence/gen1-r1-bench/run.mjs', 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 90)); s = s.replace(a, () => b); };
rep(s.split('\n')[0], "// GEN-1 R2 bench, derived from the R1 harness. BEFORE = main a2736974f (release 163), AFTER = feat/gen-1-r2 (merged tip). Plan: checks/gen-1/r2/BENCH-PLAN.md (264 runs: 180 google-low + 60 fireworks-low + 24 roadmap cards; estimate US$1.0, stop line US$1.20 settled). Roadmap items run in process: the tree's own authorInput (repairs 0, the roadmap's options) + generateArtifact, and the tree's quoteRoadmapCard bound is recorded as the hold.");
rep("default: 'C:/s/sprint2-evidence/gen1-r1-bench/plan.json'", "default: 'C:/s/sprint2-evidence/gen1-r2-bench/plan.json'");
rep("cap: { type: 'string', default: '1.74' }", "cap: { type: 'string', default: '1.20' }");
rep("default: 'C:/s/gen1-r1-trees'", "default: 'C:/s/gen1-r2-trees'");
rep("const [art, vis, usage] = await Promise.all([u('learn-artifact.js'), u('explanation-visuals.js'), u('learn-usage.js')]);",
  "const [art, vis, usage, road] = await Promise.all([u('learn-artifact.js'), u('explanation-visuals.js'), u('learn-usage.js'), u('roadmap/roadmap-generate.js')]);");
rep("trees[arm] = { generateArtifact: art.generateArtifact,", "trees[arm] = { authorInput: road.authorInput, quoteRoadmapCard: road.quoteRoadmapCard, generateArtifact: art.generateArtifact,");
// the input: a roadmap item uses the tree's own authorInput and options (repairs 0), the AFTER tree gets the bench seed (the dispatch makes its own in production)
rep("  const visuals = T.deriveVisualRequirements(T.requirementText({ args: item.prompt }));",
  "  const roadmapRec = item.roadmap ? { format: 'explanation', stepTitle: item.roadmap.stepTitle, stepGoal: item.roadmap.stepGoal, passageText: item.roadmap.passageText, documentText: null, claimsToCover: [], outcome: null, learnerInstruction: { original: `Teach me: ${item.roadmap.stepTitle}` }, teachingScope: { kind: 'document' }, depth: 'balanced' } : null;\n  const built = roadmapRec ? T.authorInput(roadmapRec, undefined, env) : null;\n  if (built?.failed) throw new Error('roadmap authorInput failed: ' + JSON.stringify(built.failed).slice(0, 200));\n  let holdMicros = null; if (roadmapRec) { const q = await T.quoteRoadmapCard(env, roadmapRec); holdMicros = q?.boundMicros ?? null; }\n  const visuals = T.deriveVisualRequirements(T.requirementText({ args: item.prompt }));");
rep("  try { out = await T.generateArtifact(env, input, { trace }); } catch (e) { thrown = e; }",
  "  try { out = built ? await T.generateArtifact(env, { ...built.input, ...(arm === 'after' ? { requestSeed: `bench-${item.idx}-${item.rep ?? 0}` } : {}) }, { ...built.options, trace }) : await T.generateArtifact(env, input, { trace }); } catch (e) { thrown = e; }");
rep("references: trace.references ?? null, shapeId: trace.shapeId ?? null,", "references: trace.references ?? null, shapeId: trace.shapeId ?? null, examples: trace.examples ?? null, examplesKind: trace.examplesKind ?? null, holdMicros,");
fs.writeFileSync('C:/s/sprint2-evidence/gen1-r2-bench/run.mjs', s);
console.log('run.mjs written');
