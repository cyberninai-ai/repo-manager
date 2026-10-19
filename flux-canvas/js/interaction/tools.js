'use strict';
// @module interaction/tools — Resize handle and one-shot placement tools (text, comment, node)
// @uses selection
function onHandle(w){ const r = 9 / S.view.zoom; return resizeHandles().find(h => Math.abs(w.x - h.x) < r && Math.abs(w.y - h.y) < r) || null; }
const HANDLE_CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
// One-shot tools: the next click places a text or a comment, then the pen comes back.
let placing = null, hoverGrow = false;
function setPlacing(kind){
  placing = kind;
  if (kind){ erasing = false; S.shapeTool = null; S.handTool = false; }
  setCursor(); paintTools();
  if (kind === 'node'){ say(`Diagram tool: click to place a ${NODE_KINDS[S.nodeKind].name}. Pick another shape in the bottom bar. Escape cancels.`); return; }
  if (kind) say(kind === 'text' ? 'Text tool: click where the text goes.' : 'Comment tool: click an element to comment on it, or empty space. Escape cancels.');
}
