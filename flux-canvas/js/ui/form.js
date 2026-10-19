'use strict';
// @module ui/form — A small form dialog for features that need more than one answer (approval flows, rituals, payments):
// labelled fields, keyboard and screen-reader friendly, no <form> element so it works in sandboxed frames
// @uses ui/dialogs (trapTab), ui/icons
// fields: [{ id, label, type: text|textarea|number|date|datetime|select|people|checks|info|section, value, options: [[value, label]…], hint, min, max,
//            half (two half fields share a row) }]; a section is a small heading that groups the fields after it
let formRes = null, formBack = null;
function formDialog(title, fields, { ok = 'OK', why = '' } = {}){
  if (formRes) formRes(null);
  formBack = document.activeElement;
  let d = $('formDlg');
  if (!d){
    d = document.createElement('div'); d.id = 'formDlg';
    d.innerHTML = '<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="formT"><h2 id="formT"></h2><p class="why" id="formWhy"></p><div id="formBody"></div><div class="acts"><button type="button" class="btn" id="formNo">Cancel</button><button type="button" class="btn primary" id="formOk"></button></div></div>';
    document.body.appendChild(d);
    d.addEventListener('keydown', e => {
      e.stopPropagation(); trapTab(e, d);
      if (e.key === 'Escape'){ e.preventDefault(); closeForm(null); }
      if (e.key === 'Enter' && (e.target.tagName === 'INPUT' && !['checkbox', 'radio'].includes(e.target.type) || e.target.tagName === 'TEXTAREA' && (e.metaKey || e.ctrlKey))){ e.preventDefault(); closeForm(readForm()); }
    });
    d.addEventListener('pointerdown', e => { if (e.target === d) closeForm(null); });
    d.querySelector('#formNo').onclick = () => closeForm(null);
    d.querySelector('#formOk').onclick = () => closeForm(readForm());
  }
  d.querySelector('#formT').textContent = title; d.querySelector('#formWhy').textContent = why; d.querySelector('#formWhy').hidden = !why;
  d.querySelector('#formOk').textContent = ok;
  d._fields = fields;
  d.querySelector('#formBody').innerHTML = fields.map(f => {
    const id = 'ff-' + f.id, hint = f.hint ? `<small id="${id}-h">${esc(f.hint)}</small>` : '', desc = f.hint ? ` aria-describedby="${id}-h"` : '';
    const v = f.value ?? '', ff = f.half ? 'ff half' : 'ff';
    if (f.type === 'section') return `<h3 class="ff-sec">${esc(f.label)}</h3>`;
    if (f.type === 'info') return `<p class="ff-info">${esc(f.label)}</p>`;
    if (f.type === 'textarea') return `<div class="${ff}"><label for="${id}">${esc(f.label)}</label><textarea id="${id}"${desc} rows="3">${esc(v)}</textarea>${hint}</div>`;
    if (f.type === 'select') return `<div class="${ff}"><label for="${id}">${esc(f.label)}</label><select id="${id}"${desc}>${f.options.map(([k, l]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${hint}</div>`;
    if (f.type === 'people' || f.type === 'checks'){
      const opts = f.type === 'people' ? (f.options || []).map(k => [k, k === S.me?.id ? `${short(k)} (you)` : short(k)]) : f.options;
      const on = new Set(Array.isArray(v) ? v : []);
      return `<fieldset class="${ff}"${desc}><legend>${esc(f.label)}</legend><div class="ff-checks">${opts.map(([k, l], i) => `<label><input type="checkbox" id="${id}-${i}" value="${esc(k)}"${on.has(k) ? ' checked' : ''}> ${esc(l)}</label>`).join('') || '<small>Nobody else yet.</small>'}</div>${hint}</fieldset>`;
    }
    const type = { number: 'number', date: 'date', datetime: 'datetime-local' }[f.type] || 'text';
    return `<div class="${ff}"><label for="${id}">${esc(f.label)}</label><input id="${id}" type="${type}" value="${esc(v)}"${f.min != null ? ` min="${f.min}"` : ''}${f.max != null ? ` max="${f.max}"` : ''}${desc} autocomplete="off">${hint}</div>`;
  }).join('');
  d.style.display = 'block';
  setTimeout(() => d.querySelector('#formBody input, #formBody textarea, #formBody select, #formOk')?.focus(), 0);
  return new Promise(res => { formRes = res; });
}
function readForm(){
  const d = $('formDlg'), out = {};
  for (const f of d._fields){
    if (f.type === 'info' || f.type === 'section') continue;
    if (f.type === 'people' || f.type === 'checks') out[f.id] = [...d.querySelectorAll(`[id^="ff-${f.id}-"]`)].filter(c => c.checked).map(c => c.value);
    else { const el = d.querySelector('#ff-' + f.id); out[f.id] = f.type === 'number' ? Number(el.value) : el.value; }
  }
  return out;
}
function closeForm(v){
  const d = $('formDlg'); d.style.display = 'none'; const r = formRes; formRes = null; r && r(v);
  (formBack && document.contains(formBack) && formBack !== document.body ? formBack : cv).focus({ preventScroll: true });
}
// "2026-10-20T14:30" for a datetime field, local time
const localDT = t => { const d = new Date(t - new Date(t).getTimezoneOffset() * 6e4); return d.toISOString().slice(0, 16); };
