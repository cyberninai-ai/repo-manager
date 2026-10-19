'use strict';
// @module core/state — Record kinds, canvas id, the global state S, BroadcastChannel name
// @uses identity
/* =====================================================================
   State
   ===================================================================== */
const ELEMENT = new Set(['DRAW', 'SHAPE', 'TEXT', 'ARROW', 'IMAGE', 'NODE']);
const KNOWN = new Set([...ELEMENT, 'GROUP', 'MOVE', 'COMMENT', 'RESOLVE', 'STYLE']);
// Canvas id lives in the URL hash when the host allows it; sandboxed frames (about:srcdoc) refuse
// history changes, so fall back to the last canvas remembered in storage.
const newCanvasId = () => b32(crypto.getRandomValues(new Uint8Array(8)));
function setHash(id){ try { history.replaceState(null, '', '#' + id); return location.hash === '#' + id; } catch { return false; } }
let freshCanvas = false;
let canvasId = (location.hash.match(/^#([a-z0-9]{6,32})$/) || [])[1];
if (!canvasId){
  try { canvasId = (localStorage.getItem('flux:lastCanvas') || '').match(/^[a-z0-9]{6,32}$/)?.[0]; } catch {}
  if (!canvasId){ canvasId = newCanvasId(); freshCanvas = true; }   // boot replaces it with an id owned by you (core/permissions)
  setHash(canvasId);
}
try { localStorage.setItem('flux:lastCanvas', canvasId); } catch {}
const S = {
  me: null, records: new Map(), blobs: new Map(), geom: new Map(), imgs: new Map(), lamport: 0,
  view: { x: -innerWidth / 2, y: -innerHeight / 2, zoom: 1 },
  color: 'ink', width: 4, textSize: 24, font: 'sans', fill: false, lassoMode: true,
  sel: new Set(), filter: null, showHidden: false, ledger: false, rejected: 0, why: {}, parked: new Map(),
  hist: [], redo: [], ghosts: [], P: null, D: { els: [], hidden: new Set(), denied: new Set(), off: new Map(), groupOf: new Map(), groups: [], next: new Map(), superseded: new Set(), threads: new Map(), kids: new Map() },
};
const byZ = (a, b) => a.z - b.z || (a.cid < b.cid ? -1 : a.cid > b.cid ? 1 : 0);
let channelName = `canvas.${canvasId}.strokes`;
let bc = null;
// shared frame state: the renderer reads it, interaction writes it
let dirty = true;          // something changed: draw the next frame
let G = null;              // the gesture in progress (interaction/pointer, selection)
let hoverEdge = null;      // the element whose edge the pointer is on (a connector would start there)
let editingCid = null;     // the text being edited, hidden while its editor is open

