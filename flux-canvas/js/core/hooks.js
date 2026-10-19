'use strict';
// @module core/hooks — Extension points. Features register record types, derived views, render layers,
// toolbar buttons, palette commands, keys, channel messages, templates and examples here instead of editing the core.
// Every hook list is read at the moment it is used, so a feature only has to load before boot.

// ACTION → { parse(rec, fields) — fill rec from fields, throw on malformed; fence?: action allowed inside a P-fence }
const RECORD_TYPES = {};
const NAMES = new Map();           // author key → display name (example authors; profiles later)
function registerRecord(action, spec){ RECORD_TYPES[action] = spec; KNOWN.add(action); }

const DERIVE_HOOKS = [];        // (D, byType) after the core derive; byType[action] = that action's records in z order
const RENDER_HOOKS = {
  world: [],                    // (z) drawn in canvas coordinates above elements
  screen: [],                   // () drawn in screen pixels above everything else
};
const POINTER_HOOKS = [];       // (e, w) on primary press before any tool; return true when handled
const TOOLBAR_HOOKS = [];       // (rs, one, B) → extra selection-toolbar buttons (HTML)
const TOOLBAR_ACTIONS = {};     // data-a → async (rs, button) when a toolbar button is clicked
const PALETTE_HOOKS = [];       // (add) → add(group, title, run, { k, on })
const KEY_HOOKS = [];           // (e, { onCanvas, mod, k }) → true when handled; runs before the built-in keymap
const WIRE_HOOKS = {};          // key → handler for ephemeral channel messages { [key]: payload }
const TEMPLATES = [];           // { id, name, icon, blurb, build: async (at) } — "Start something" in the canvas home
const EXAMPLES = [];            // { id, title, icon, blurb, build: async (authors) } — worked use cases

// Run a feature hook without letting one feature's bug stop the others.
function runHooks(list, ...args){ for (const h of list){ try { h(...args); } catch (err){ console.warn('hook failed', err); } } }
