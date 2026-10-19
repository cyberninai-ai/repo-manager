'use strict';
// @module ui/dialogs — Focus trapping for every modal dialog, and the report dialog (Markdown summaries and audit reports)
// @uses chrome ($, toast, say)

const FOCUSABLE = 'button:not([disabled]), [href], input:not([hidden]), textarea:not([hidden]), select, [tabindex]:not([tabindex="-1"])';
// Keep Tab inside an open dialog: the canvas behind it is inert while the dialog is up.
function trapTab(e, root){
  if (e.key !== 'Tab') return;
  const f = [...root.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
  if (!f.length){ e.preventDefault(); return; }
  const first = f[0], last = f[f.length - 1];
  if (f.length === 1 || (e.shiftKey && document.activeElement === first)){ e.preventDefault(); (f.length === 1 ? first : last).focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}
for (const id of ['pal', 'ask', 'help', 'home', 'report']){
  const el = document.getElementById(id);
  if (el) el.addEventListener('keydown', e => trapTab(e, el));
}

/* report: a read-only Markdown document with copy and download */
let reportBack = null;
function openReport(title, md, fileName = 'report.md'){
  reportBack = document.activeElement;
  $('reportT').textContent = title; $('reportBody').textContent = md; $('report').dataset.file = fileName;
  $('report').hidden = false; setTimeout(() => $('reportCopy').focus(), 0);
  say(`${title} ready. Copy or download it.`);
}
function closeReport(){ $('report').hidden = true; (reportBack && document.contains(reportBack) ? reportBack : cv).focus({ preventScroll: true }); }
$('reportClose').onclick = closeReport;
$('reportCopy').onclick = () => copy($('reportBody').textContent, 'Copied as Markdown');
$('reportSave').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([$('reportBody').textContent], { type: 'text/markdown' }));
  a.download = $('report').dataset.file || 'report.md'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('report').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closeReport(); });
