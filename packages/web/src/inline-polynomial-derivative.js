// A deliberately small exact polynomial checker, not a general CAS or LaTeX interpreter.
// Callers own selection/permission checks and must supply the exact frozen equation text.
const LIMITS = Object.freeze({chars:512, tokens:128, depth:16, degree:32, bits:256});
const unsupported = () => { throw new Error('Use a single-variable polynomial with rational coefficients, constant denominators and integer powers from 0 to 32 (within the expression size limits).'); };
const abs = n => n < 0n ? -n : n;
function rational(n, d = 1n) {
  if (!d) unsupported();
  if (d < 0n) { n = -n; d = -d; }
  let a = abs(n), b = d;
  while (b) [a, b] = [b, a % b];
  n /= a; d /= a;
  if (abs(n).toString(2).length > LIMITS.bits || d.toString(2).length > LIMITS.bits) unsupported();
  return {n,d};
}
const zero = () => rational(0n);
const add = (a,b) => rational(a.n*b.d+b.n*a.d,a.d*b.d);
const multiply = (a,b) => rational(a.n*b.n,a.d*b.d);
const negate = a => ({n:-a.n,d:a.d});
function trim(p) { while (p.length > 1 && p.at(-1).n === 0n) p.pop(); return p; }
function sum(a,b,sign=1n) {
  return trim(Array.from({length:Math.max(a.length,b.length)}, (_,i) => add(a[i] || zero(), multiply(b[i] || zero(),rational(sign)))));
}
function product(a,b) {
  if (a.length+b.length-2 > LIMITS.degree) unsupported();
  const result = Array.from({length:a.length+b.length-1},zero);
  for (let i=0;i<a.length;i++) for (let j=0;j<b.length;j++) result[i+j] = add(result[i+j],multiply(a[i],b[j]));
  return trim(result);
}
function parse(source, variable) {
  if (typeof source !== 'string' || !source.trim() || source.length > LIMITS.chars) unsupported();
  const tokens=[];
  for (let offset=0;offset<source.length;) {
    const rest=source.slice(offset), space=/^\s+/.exec(rest);
    if (space) { offset+=space[0].length; continue; }
    const match=/^(?:\d+(?:\.\d+)?|\.\d+)|^\\[A-Za-z]+|^[A-Za-z()+*/^{}-]/.exec(rest);
    if (!match || tokens.length >= LIMITS.tokens) unsupported();
    tokens.push(match[0]); offset+=match[0].length;
  }
  // MathLive delimiters are accepted only as a paired decoration around parentheses.
  // No generic command stripping: an unsupported command must remain an error.
  const normalized=[];
  let decorated=0;
  for (let i=0;i<tokens.length;i++) {
    if (tokens[i]==='\\left') {
      if (tokens[++i]!=='(') unsupported();
      decorated++; normalized.push('(');
    } else if (tokens[i]==='\\right') {
      if (tokens[++i]!==')' || --decorated<0) unsupported();
      normalized.push(')');
    } else normalized.push(['\\cdot','\\times'].includes(tokens[i])?'*':tokens[i]);
  }
  if (decorated) unsupported();
  let at=0;
  const peek=()=>normalized[at];
  const take=()=>normalized[at++];
  function group(depth,open) {
    if (take()!==open) unsupported();
    const p=expression(depth+1);
    if (take()!==(open==='('?')':'}')) unsupported();
    return p;
  }
  function atom(depth) {
    if (depth>LIMITS.depth) unsupported();
    const t=peek();
    if (t==='(' || t==='{') return group(depth,t);
    if (t==='\\frac') {
      take();
      const a=group(depth,'{'), b=group(depth,'{');
      if (b.length!==1 || !b[0].n) unsupported();
      return a.map(c=>multiply(c,rational(b[0].d,b[0].n)));
    }
    if (t===variable) { take(); return [zero(),rational(1n)]; }
    if (typeof t==='string' && /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(t)) {
      take(); const parts=t.split('.');
      return [rational(BigInt((parts[0]||'0')+(parts[1]||'')),10n**BigInt((parts[1]||'').length))];
    }
    unsupported();
  }
  function power(depth) {
    let p=atom(depth);
    if (peek()==='^') {
      take(); const brace=peek()==='{'; if(brace) take();
      const exponent=take();
      if (typeof exponent!=='string' || !(brace?/^\d{1,2}$/:/^\d$/).test(exponent) || Number(exponent)>LIMITS.degree || (brace&&take()!=='}')) unsupported();
      const base=p; p=[rational(1n)];
      for(let i=0;i<Number(exponent);i++) p=product(p,base);
    }
    return p;
  }
  function unary(depth) {
    if(depth>LIMITS.depth) unsupported();
    if(peek()==='+' || peek()==='-') { const sign=take(); const p=unary(depth+1); return sign==='-'?p.map(negate):p; }
    return power(depth);
  }
  function term(depth) {
    let p=unary(depth);
    while (peek()==='*' || peek()==='/' || [variable,'(','{','\\frac'].includes(peek())) {
      const explicit=peek()==='*'||peek()==='/';
      const op=explicit?take():'*', right=unary(depth);
      if(op==='/') {
        // 1/2x has competing conventional readings; require (1/2)x or 1/(2x).
        if([variable,'(','{','\\frac'].includes(peek())) unsupported();
        if(right.length!==1 || !right[0].n) unsupported();
        p=p.map(c=>multiply(c,rational(right[0].d,right[0].n)));
      } else p=product(p,right);
    }
    return p;
  }
  function expression(depth) {
    let p=term(depth);
    while(peek()==='+' || peek()==='-') {const op=take();p=sum(p,term(depth),op==='+'?1n:-1n);}
    return p;
  }
  const result=trim(expression(0));
  if(at!==normalized.length) unsupported();
  return result;
}
function format(p,variable) {
  const parts=[];
  for(let i=p.length-1;i>=0;i--) {
    const {n,d}=p[i]; if(!n) continue;
    const magnitude=abs(n), coefficient=i&&magnitude===d?'':d===1n?`${magnitude}`:`\\frac{${magnitude}}{${d}}`;
    parts.push(`${parts.length?(n<0n?' - ':' + '):(n<0n?'-':'')}${coefficient}${i?variable:''}${i>1?`^{${i}}`:''}`);
  }
  return parts.join('')||'0';
}
export function checkPolynomialDerivative(input) {
  try {
    if (!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!['source','claim','variable'].includes(k)) || typeof input.variable!=='string' || !/^[A-Za-z]$/.test(input.variable)) unsupported();
    const {source,claim,variable}=input;
    const original=parse(source,variable), candidate=parse(claim,variable);
    const derivative=trim(original.length===1?[zero()]:original.slice(1).map((c,i)=>multiply(c,rational(BigInt(i+1)))));
    const equivalent=derivative.length===candidate.length && derivative.every((c,i)=>c.n===candidate[i].n&&c.d===candidate[i].d);
    return {ok:true,equivalent,derivativeLatex:format(derivative,variable),
      assumptions:[`${variable} is a real scalar; numeric coefficients are exact rational constants.`],
      limitations:['Polynomial expressions only; this is not a general symbolic mathematics engine.','Physical units are not inferred or checked.','Ambiguous slash division followed by implicit multiplication is refused; use explicit parentheses or multiplication.'],
      evidence:{source,claim,variable,method:'exact-rational-polynomial'}};
  } catch { return {ok:false,reason:'Unsupported or oversized polynomial expression. Use one explicit variable, rational constants, constant denominators and nonnegative integer powers up to 32.'}; }
}
