'use strict';
// @module core/grammar — Pattern grammar: build() and parse() of ACTION-KEY-VALUE…-SIG patterns with . fences
// @uses encoding
/* =====================================================================
   Grammar: ACTION-KEY-VALUE-…-SIG-sig   Fences: KEY-.CHILD.CHILD.
   Values never contain "-" or "."; children are full patterns.
   ===================================================================== */
function build(action, pairs){
  return action + pairs.map(([k, v]) => '-' + k + '-' + (Array.isArray(v) ? '.' + v.join('.') + '.' : String(v))).join('');
}
function parse(s){
  const r = parseAt(s, 0);
  if (r.end !== s.length) throw Error('trailing input at ' + r.end);
  return r.node;
}
function parseAt(s, i){
  const start = i;
  const tok = () => { const a = i; while (i < s.length && s[i] !== '-' && s[i] !== '.') i++; return s.slice(a, i); };
  const action = tok();
  if (!/^[A-Z]+$/.test(action)) throw Error('bad action');
  const fields = {}, order = [];
  while (i < s.length && s[i] === '-'){
    i++; const key = tok();
    if (!/^[A-Z]+$/.test(key) || s[i] !== '-') throw Error('bad block ' + key);
    i++;
    let val;
    if (s[i] === '.'){
      i++; val = [];
      if (s[i] === '.') i++;
      else for (;;){
        const c = parseAt(s, i); val.push(c.node); i = c.end;
        if (s[i] !== '.') throw Error('unclosed fence'); i++;
        if (!/[A-Z]/.test(s[i] || '')) break;
      }
    } else val = tok();
    fields[key] = val; order.push(key);
  }
  return { node: { action, fields, order, raw: s.slice(start, i) }, end: i };
}
const payloadOf = raw => raw.slice(0, raw.lastIndexOf('-SIG-'));

