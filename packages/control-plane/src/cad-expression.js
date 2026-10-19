// Arithmetic only: model text is never JavaScript, Python, or measured geometry.
export function cadExpression(expression, parameters, { requireParameter = false } = {}) {
  const invalid = () => { throw new Error('Invalid CAD measurement expression.'); };
  if (typeof expression !== 'string' || !expression.trim() || expression.length > 512) invalid();
  const tokens = [];
  let offset = 0;
  while (offset < expression.length) {
    const rest = expression.slice(offset);
    const whitespace = /^\s+/.exec(rest);
    if (whitespace) { offset += whitespace[0].length; continue; }
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|^[A-Za-z_][A-Za-z0-9_]*|^[()+*/-]/.exec(rest);
    if (!match || tokens.length >= 128) invalid();
    tokens.push(match[0]);
    offset += match[0].length;
  }
  let at = 0;
  let usedParameter = false;
  const finite = value => { if (!Number.isFinite(value)) invalid(); return value; };
  function primary(depth) {
    if (depth > 16) invalid();
    const token = tokens[at++];
    if (token === '+' || token === '-') return finite((token === '-' ? -1 : 1) * primary(depth + 1));
    if (token === '(') {
      const value = sum(depth + 1);
      if (tokens[at++] !== ')') invalid();
      return value;
    }
    if (token === 'pi') return Math.PI;
    if (typeof token !== 'string') invalid();
    if (/^[\d.]/.test(token)) return finite(Number(token));
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) invalid();
    if (['constructor', 'prototype', '__proto__'].includes(token) || !Object.hasOwn(parameters, token) || typeof parameters[token] !== 'number') invalid();
    usedParameter = true;
    return finite(parameters[token]);
  }
  function product(depth) {
    let value = primary(depth);
    while (tokens[at] === '*' || tokens[at] === '/') {
      const operation = tokens[at++], right = primary(depth);
      if (operation === '/' && right === 0) invalid();
      value = finite(operation === '*' ? value * right : value / right);
    }
    return value;
  }
  function sum(depth) {
    let value = product(depth);
    while (tokens[at] === '+' || tokens[at] === '-') {
      const operation = tokens[at++], right = product(depth);
      value = finite(operation === '+' ? value + right : value - right);
    }
    return value;
  }
  const value = sum(0);
  if (at !== tokens.length || requireParameter && !usedParameter) invalid();
  return value;
}
