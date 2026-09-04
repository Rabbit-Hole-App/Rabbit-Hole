'use strict';
const fs = require('fs');
const path = require('path');

// The six input types. Anything else stops small init and small deploy in one line.
const TYPES = ['file', 'number', 'select', 'date', 'text', 'bool'];

function checkSchema(config) {
  for (const [name, spec] of Object.entries(config.inputs || {})) {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error(`[inputs] ${name} must be a table like { type = "text" }`);
    if (!TYPES.includes(spec.type)) throw new Error(`[inputs] ${name}: unknown type "${spec.type}" — one of ${TYPES.join(', ')}`);
    if (spec.type === 'select' && !Array.isArray(spec.options)) throw new Error(`[inputs] ${name}: select needs options = ["a", "b"]`);
  }
  for (const [name, spec] of Object.entries(config.outputs || {})) {
    if (!spec || typeof spec !== 'object' || typeof spec.path !== 'string') throw new Error(`[outputs] ${name} needs path = "file.ext"`);
  }
}

// "-7d" and friends resolve to a concrete date here so the script gets YYYY-MM-DD.
function resolveDate(raw, flag) {
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const rel = s.match(/^-(\d+)d$/);
  if (rel) return new Date(Date.now() - Number(rel[1]) * 86400000).toISOString().slice(0, 10);
  throw new Error(`--${flag} must be YYYY-MM-DD or -<n>d, got "${s}"`);
}

// Validate CLI flags against [inputs] before anything is uploaded.
// Returns { values, files }: values is what the run records (files by original
// filename), files maps input name -> { path, size } still on local disk.
function validate(schema, flags) {
  const values = {};
  const files = {};
  const names = Object.keys(schema || {});
  const known = new Set(names.map((n) => n.replace(/_/g, '-')));
  for (const key of Object.keys(flags)) {
    if (key === '_' || key === 'app' || key === 'download') continue;
    if (!known.has(key)) throw new Error(`unknown input --${key}${names.length ? ` — declared: ${[...known].map((k) => '--' + k).join(', ')}` : ' — this app declares no [inputs]'}`);
  }
  for (const name of names) {
    const spec = schema[name];
    const flag = name.replace(/_/g, '-');
    let raw = flags[flag];
    if (raw === undefined) {
      if (spec.default !== undefined) raw = spec.default;
      else if (spec.required) throw new Error(`--${flag} is required (${spec.type}${spec.help ? `: ${spec.help}` : ''})`);
      else continue;
    }
    if (spec.type === 'bool') {
      if (raw === true || raw === 'true') values[name] = true;
      else if (raw === false || raw === 'false') values[name] = false;
      else throw new Error(`--${flag} takes no value (or true/false), got "${raw}"`);
    } else if (raw === true) {
      throw new Error(`--${flag} needs a value (${spec.type})`);
    } else if (spec.type === 'number') {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new Error(`--${flag} must be a number, got "${raw}"`);
      if ((spec.min !== undefined && n < spec.min) || (spec.max !== undefined && n > spec.max)) {
        throw new Error(`--${flag} ${n} out of range (${spec.min !== undefined ? spec.min : '-∞'}–${spec.max !== undefined ? spec.max : '∞'})`);
      }
      values[name] = n;
    } else if (spec.type === 'select') {
      if (!spec.options.includes(raw)) throw new Error(`--${flag} must be one of: ${spec.options.join(', ')}`);
      values[name] = raw;
    } else if (spec.type === 'date') {
      values[name] = resolveDate(raw, flag);
    } else if (spec.type === 'text') {
      const s = String(raw);
      if (spec.pattern && !new RegExp(spec.pattern).test(s)) throw new Error(`--${flag} must match ${spec.pattern}, got "${s}"`);
      values[name] = s;
    } else if (spec.type === 'file') {
      const ext = path.extname(String(raw)).toLowerCase();
      if (spec.accept) {
        const ok = spec.accept.split(',').map((e) => e.trim().toLowerCase());
        if (!ok.includes(ext)) throw new Error(`--${flag}: ${ext || 'no extension'} not in accept (${spec.accept})`);
      }
      if (!fs.existsSync(raw)) throw new Error(`--${flag}: ${raw} not found`);
      files[name] = { path: String(raw), size: fs.statSync(raw).size };
      values[name] = path.basename(String(raw));
    }
  }
  return { values, files };
}

module.exports = { checkSchema, validate, TYPES };
