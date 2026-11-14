// Release 140 v2 evidence: add the EXPLAIN_JOBS Durable Object and the v2 / scripted-interact vars to the RENDERED local app config (never the repo). Usage: node patch-v2-config.cjs <rendered integ-local.jsonc>
const fs = require('fs'); const f = process.argv[2]; let t = fs.readFileSync(f, 'utf8');
const once = (from, to) => { if (t.split(from).length !== 2) { console.error('anchor not unique: ' + from); process.exit(3); } t = t.replace(from, () => to); };
once('"bindings": [', '"bindings": [\n      { "name": "EXPLAIN_JOBS", "class_name": "ExplainJobs" },');
once('"migrations": [', '"migrations": [\n    { "tag": "explain-jobs-1", "new_sqlite_classes": ["ExplainJobs"] },');
once('"vars": {', '"vars": {\n    "EXPLAIN_V2_ENABLED": "true", "EXPLAIN_PROGRAM_ENABLED": "true", "EXPLAIN_PROGRAM_STATEFUL": "true", "EXPLAIN_DIAGNOSTICS": "true",\n    "EXPLAIN_BRIEF_THRESHOLDS": "{\\"components\\":12,\\"credits\\":400}",\n    "INTERACT_SCENE_PLAN_ENABLED": "true", "INTERACT_BUILD_PROFILE": "scripted", "INTERACT_DESIGN_FIXTURE": "toss", "INTERACT_DESCRIPTION_FIT": "estimate",');
fs.writeFileSync(f, t); console.log('patched ' + f);
