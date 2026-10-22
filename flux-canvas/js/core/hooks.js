'use strict';
// @module core/hooks — Extension points. Features register record types, derived views, render layers,
// toolbar buttons, palette commands, keys, channel messages, templates and examples here instead of editing the core.
// Every hook list is read at the moment it is used, so a feature only has to load before boot.

// Field N is reserved: on any record it means revoke (N-1) or restore (N-0) the record named by R (core/records).
// ACTION → { parse(rec, fields) — fill rec from fields, throw on malformed; fence?: action allowed inside a P-fence;
//            check?: async (rec) → false to refuse it; inherit?: false when a fork must not copy it (governance, payments);
//            say?: (rec, target) → what it did, in words, for the activity log }
const RECORD_TYPES = {};
const NAMES = new Map();           // author key → display name (example authors; profiles later)
function registerRecord(action, spec){ RECORD_TYPES[action] = spec; KNOWN.add(action); }

const DERIVE_HOOKS = [];
const DERIVE_FINAL = [];        // (D, byType) after every DERIVE_HOOKS entry: judgements that read other features' views (deliveries)        // (D, byType) after the core derive; byType[action] = that action's records in z order
const RENDER_HOOKS = {
  under: [],                    // () drawn in canvas coordinates below the elements (diagram tree links)
  world: [],                    // (z) drawn in canvas coordinates above elements
  overlay: [],                  // (z) after the selection: comment pins, other people's cursors (they set their own transform)
  screen: [],                   // () drawn in screen pixels above everything else
  dom: [],                      // () HTML overlays painted after each frame: style bar, selection toolbar, previews, overview
};
const FRAME_HOOKS = [];         // () every animation frame, drawn or not (signing pill countdown)
const CHANGE_HOOKS = [];        // () after the records changed and derive() ran (people, ledger, comments)
const SYNC_HOOKS = [];          // () when connection state or the state root changes (session panel, live button)
const ACTION_HOOKS = [];        // () before an undo, redo or revoke: finish what a gesture left pending (keyboard moves)
const POINTER_HOOKS = [];       // (e, w) on primary press before any tool; return true when handled
const TOOLBAR_HOOKS = [];       // (rs, one, B) → extra selection-toolbar buttons (HTML)
const TOOLBAR_ACTIONS = {};     // data-a → async (rs, button) when a toolbar button is clicked
const PALETTE_HOOKS = [];       // (add) → add(group, title, run, { k, on })
const KEY_HOOKS = [];           // (e, { onCanvas, mod, k }) → true when handled; runs before the built-in keymap
const WIRE_HOOKS = {};          // key → handler for ephemeral channel messages { [key]: payload }
const DELIVERY_HOOKS = {        // features that extend a delivery (features/work) without editing it
  evaluate: [],                 // (x, D, byType) adjust x.done / x.need / x.blockers (approval flows, conditions)
  proof: [],                    // (x, lines) add sections to the proof
  row: [],                      // (x) → HTML under a delivery in the Work panel
  choices: [],                  // (others) → menu items that resolve how a new delivery is approved: { approvers, quorum, flow }
  compose: [],                  // { fields: () → form fields, apply?: (values, plan) → plan, after?: async (values, deliveryCid) } in the Deliver dialog
};
const FLOW_CONDITIONS = {};     // id → { label, test(D) → true or the reason it isn't met }: what an approval flow can require
const RECORD_GATES = [];        // (allRecords, policy) → null | (r) → null | 'deny' | 'pending'; run in derive after permissions (zones)
const PUBLISH_FILTERS = [];     // async (raw, blobs) → undefined to publish as is, or the CID of what was published instead (silent rounds seal)
const WIRE_INGEST_HOOKS = [];   // (msg, from, chan) after a wire message brought records this browser didn't have (mesh forwarding)
const PRESENCE_FIELDS = [];     // () → fields merged into your presence (attention)
const IDENTITY = { of: k => k };   // key → the person it belongs to; linked devices and recovery (features/devices) replace it
const personOf = k => IDENTITY.of(k);
// a signing key as it appears in records and presence (Ed25519 or ECDSA, base58): anything else is refused before it reaches HTML
const isKey = k => typeof k === 'string' && /^(ed|ec)[1-9A-HJ-NP-Za-km-z]{20,120}$/.test(k);
const isCid = c => typeof c === 'string' && /^bafk[a-z2-7]{20,80}$/.test(c);
const isCanvas = c => typeof c === 'string' && /^[a-z0-9]{6,32}$/.test(c);
const isRoot = h => typeof h === 'string' && /^[a-z2-7]{20,64}$/.test(h);
const must = (ok, what) => { if (!ok) throw Error(what); };   // parse checks: a record that fails one is refused as malformed
const cidList = v => { const l = String(v || '').split('_').filter(Boolean); must(l.every(isCid), 'cid list'); return l; };
const keyList = (v, sep = '_') => { const l = String(v || '').split(sep).filter(Boolean); must(l.every(isKey), 'key list'); return l; };
// a key named only for its own type: "toString" or "__proto__" are not stances, kinds or conditions
const own = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);
const samePerson = (a, b) => !!a && !!b && personOf(a) === personOf(b);
// The feature catalogue: every feature module describes itself once; the hub, the palette and the docs read it.
const FEATURES = [];            // { id, name, group, icon, blurb, records: [ACTION…], open?: () }
function registerFeature(f){ FEATURES.push(f); }
const TEMPLATES = [];           // { id, name, icon, blurb, build: async (at) } — "Start something" in the canvas home
const EXAMPLES = [];            // { id, title, icon, blurb, build: async (authors) } — worked use cases

// Run a feature hook without letting one feature's bug stop the others.
function runHooks(list, ...args){ for (const h of list){ try { h(...args); } catch (err){ console.warn('hook failed', err); } } }
