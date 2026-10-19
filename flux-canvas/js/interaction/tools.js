'use strict';
// @module interaction/tools — Resize handle and one-shot placement tools (text, comment, node)
// @uses selection
function onHandle(w){ const h = resizeHandle(); return h && Math.hypot(w.x - h.x, w.y - h.y) < 12 / S.view.zoom ? h : null; }
// One-shot tools: the next click places a text or a comment, then the pen comes back.
let placing = null, hoverGrow = false;
function setPlacing(kind){
  placing = kind;
  if (kind){ erasing = false; S.shapeTool = null; S.handTool = false; }
  setCursor(); paintTools();
  if (kind === 'node'){ say(`Diagram tool: click to place a ${NODE_KINDS[S.nodeKind].name}. Pick another shape in the bottom bar. Escape cancels.`); return; }
  if (kind) say(kind === 'text' ? 'Text tool: click where the text goes.' : 'Comment tool: click an element to comment on it, or empty space. Escape cancels.');
}
