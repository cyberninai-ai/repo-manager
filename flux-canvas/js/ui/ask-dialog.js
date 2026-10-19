'use strict';
// @module ui/ask-dialog — Accessible replacement for prompt(): text or multi-line, works in sandboxes
// Accessible stand-in for prompt(): also works in sandboxed frames.
let askRes = null, askFocus = null;
function ask(label, value = '', why = '', preview = null, multi = false){
  if (askRes) askRes(null);
  askFocus = document.activeElement;
  const pi = $('askImg');
  if (preview){
    const k = Math.min(1, 440 / preview.width, 200 / preview.height);
    pi.width = Math.max(1, Math.round(preview.width * k)); pi.height = Math.max(1, Math.round(preview.height * k));
    pi.getContext('2d').drawImage(preview, 0, 0, pi.width, pi.height); pi.hidden = false;
  } else pi.hidden = true;
  $('askT').textContent = label; $('askWhy').textContent = why; $('askWhy').style.display = why ? 'block' : 'none';
  const fld = multi ? $('askTa') : $('askIn');
  $('askIn').hidden = multi; $('askTa').hidden = !multi; $('askT').htmlFor = multi ? 'askTa' : 'askIn';
  fld.value = value; $('ask').style.display = 'block'; setTimeout(() => { fld.focus(); fld.select(); }, 0);
  return new Promise(res => { askRes = res; });
}
function closeAsk(v){
  $('ask').style.display = 'none'; const r = askRes; askRes = null; r && r(v);
  const back = askFocus && document.contains(askFocus) && askFocus !== document.body ? askFocus : cv; back.focus({ preventScroll: true });
}
