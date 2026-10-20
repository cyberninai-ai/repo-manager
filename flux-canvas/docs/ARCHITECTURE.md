# Flux Canvas — architecture

This is for developers working on the canvas. Read [PATTERNS.md](PATTERNS.md) for the data format and [PLAN.md](PLAN.md) for where things are going.

## Layout

```
flux-canvas/
  index.html          markup only: every component's DOM, then <link> and <script> tags in load order
  css/                12 stylesheets, one per surface (tokens first, responsive and collab last)
  js/
    core/             data: encoding, grammar, identity, state, blobs, records, persistence, derive, hooks
    render/           geometry and the frame renderer
    model/            commands: gestures and actions → signed records; undo/redo
    interaction/      selection, pointer, text editor, tools, keyboard
    ui/               icons, tool dock + menus + tooltips, chrome, style bar, palette, ledger, zoom, dialogs, actions
    features/         one file per capability (diagrams, comments, brainstorm, audit …)
    boot.js
  tools/build.mjs     inlines everything into ../flux-canvas.html (the shipped single file)
  tools/deps.mjs      module graph and layer check (npm run check)
  tools/relay.mjs     dependency-free WebSocket relay that also serves the app (npm run relay)
  tests/              Playwright suites + runner (bundle or source target)
  docs/               this file, DESIGN, PATTERNS, PLAN, AUDIT, USE-CASES
```

**Commands**

```sh
cd flux-canvas
npm install                 # playwright + axe-core, for tests only
npm run build               # writes ../flux-canvas.html
npm run check               # fails if ../flux-canvas.html is stale or a layer rule is broken (CI)
npm run relay               # http://localhost:8787: the app plus live sync between browsers
npm test                    # all suites against the bundle
npm run test:source         # all suites against the modular source, served over http
npm run serve               # http://localhost:8080 for development
```

The app has no runtime dependencies and no build step to run it: open `index.html` (or the bundle) from disk.

## Why classic scripts, and what that means

The bundle has to open from `file://` and inside sandboxed viewers. Browsers refuse `type="module"` from `file://`. So the source is **ordered classic scripts that share one global scope**:

- A file may use anything declared in an earlier file, at load time or later. It may use anything declared in a later file only at runtime, inside a function that runs after load.
- `index.html` is the single source of truth for load order. `tools/build.mjs` follows it.
- Each file starts with `'use strict'`, an `// @module` line saying what it is, and `// @uses` listing what it leans on.

### Layers, enforced (audit A1)

`tools/deps.mjs` reads the source and works out the real dependency graph: which top-level names each module uses from which other module. It then enforces the layers:

```
core  →  render  →  model  →  interaction · ui · features  →  boot
data      drawing    commands     the app (may use each other)
```

- A module may use its own layer and the layers below it. Lower layers reach the app only through `core/hooks.js`. For example, `derive()` runs `CHANGE_HOOKS`, the renderer runs `RENDER_HOOKS`, and `undo()` runs `ACTION_HOOKS`.
- Two files must never declare the same top-level name: in one shared scope, that stops the bundle from loading.
- `npm run check` runs this check (with the stale-bundle check). `npm run deps` regenerates [DEPENDENCIES.md](DEPENDENCIES.md).

**ES modules:** they stay deferred on purpose. Browsers refuse them from `file://`, and the shared mutable frame state (`dirty`, `G`) would need setters across every module. The enforced layers give the boundary guarantee without that cost.

## Data flow

```
pointer / keyboard / palette
        │
        ▼
 command  (model/commands, features/*)        e.g. commitNode, toggleReact, giveVerdict
        │  signed(action, pairs)  → ACTION-…-SIG-sig      (core/identity)
        ▼
 publish(raw, blobs) ─► post() ─┬─► BroadcastChannel ──► other tabs here ─┐
        │                         └─► WebSocket relay ───► other browsers ──┴► onWire → ingest
        │                                (core/net; HELLO/records sync on join)       (core/records)
        ▼
 ingest: parse → CID → verify (WebCrypto, or core/ed25519) → toRec (+ feature parsers, + async check)
        → plausible Z and T? (else parked) → S.records → IndexedDB log (core/persistence, core/db)
        │  changed()  (microtask; once per batch while loading)
        ▼
 derive(): S.records → permissions (OWNER/GRANT) → S.D  (hidden, offsets, groups, edits, threads, styles, tree, + DERIVE_HOOKS)
        │  runHooks(CHANGE_HOOKS): people, ledger, comments, outline
        │  dirty = true
        ▼
 render(): grid → RENDER_HOOKS.under → S.D.els → world → selection → overlay → screen → dom (style bar, toolbar, previews, overview)
```

Rules that keep peers consistent:

1. **Nothing renders from local intent.** Your own stroke is drawn as a ghost until it has been signed and ingested, exactly like a peer's.
2. **`derive()` is a pure function of `S.records`** (plus the history cursor `S.histZ`). It decides authority: who may revoke, edit, restyle, move. Never mutate records elsewhere.
3. **UI state is never a record:** selection, open panels, timers, presence and the vote budget. Shared ephemeral state goes over the channel through `WIRE_HOOKS`.

## Global state

| Name | Where | What |
|---|---|---|
| `S` | core/state | The canvas: `records`, `blobs`, `view`, tool settings, `sel`, `hist`/`redo`, `D` (the derived view), `P` (permissions), `why` and `parked` (refusals) |
| `S.D` | core/derive | `els` (z order), `hidden`, `off`, `groupOf`, `next`/`superseded` (edits), `threads`, `kids` (tree), plus feature views: `reactions`, `audits`, `signoffs`, `meta` |
| `G`, `dirty`, `hoverEdge`, `editingCid` | core/state | Shared frame state: the gesture in progress (`kind`: stroke, line, rect, move, resize, lasso, grow, pin, erase, pan …), whether to redraw, the edge under the pointer, the text being edited |
| `canvasId`, `bc`, `NET` | core/state, core/net | Current canvas, its BroadcastChannel, and the relay connection (`state`, `peers`, `url`) |
| `DB` | core/db | IndexedDB handle; `DB.ok` is false in sandboxes (localStorage fallback) |

## Extension points (core/hooks.js)

A feature registers here and needs no edits to the core:

| Hook | Signature | Used by |
|---|---|---|
| `registerRecord(action, { parse, fence?, check?, inherit? })` | adds a record type. `fence` names the action allowed inside its `P` fence (each verified on its own). `check` is an async validity test run on ingest. `inherit: false` keeps it out of forks (governance, payments). Field `N` is reserved for revocation | canvases (META), brainstorm (REACT), audit (AUDIT, SIGNOFF), permissions (OWNER with `check`, GRANT) |
| `DERIVE_HOOKS` | `(D, byType)` after the core derive | reactions, verdicts, sign-offs, canvas title |
| `RENDER_HOOKS.under` / `.world` / `.overlay` / `.screen` / `.dom` | drawing layers: below elements, above them, after the selection, in screen pixels, then HTML overlays | tree links; ghosts, `+` handles, chips, badges; pins and cursors; style bar, selection toolbar, previews, overview |
| `CHANGE_HOOKS` | `()` after records changed and `derive()` ran | people, ledger, comments, outline |
| `FRAME_HOOKS` | `()` every animation frame | signing pill countdown |
| `ACTION_HOOKS` | `()` before undo, redo or revoke | finish a pending keyboard move |
| `POINTER_HOOKS` | `(e, w) → true` if handled | chip toggling, presentation clicks |
| `TOOLBAR_HOOKS` / `TOOLBAR_ACTIONS` | buttons HTML / `async (rs, button)` | relations, votes, reactions, arrange, palette, masonry |
| `PALETTE_HOOKS` | `(add)` | every feature's commands |
| `KEY_HOOKS` | `(e, { onCanvas, mod, k }) → true` | H, D, A, ⇧H, ⇧S, F5, presentation keys |
| `WIRE_HOOKS[key]` | ephemeral messages on every transport | presence, shared timer |
| `TEMPLATES` / `EXAMPLES` | canvas home cards | every use case |
| `NAMES` | author key → display name | example authors, profiles |
| `registerFeature({ id, name, group, icon, blurb, records, status?, open })` | the feature catalogue: the Team hub and the palette read it | every team feature (docs/FEATURES.md) |
| `DELIVERY_HOOKS.evaluate` / `.proof` / `.row` / `.choices` | judge a delivery, add proof sections, add Work-panel rows, offer ways to approve | flows; contribution, payouts, witnesses, excerpts, claims |
| `FLOW_CONDITIONS[id]` | `{ label, test(D) → true or a reason }`: what an approval flow can require | claims, stances, decisions, rituals, tasks, critical path |
| `RECORD_GATES` | `(all, policy) → (r) → null / 'deny' / 'pending'`, in derive after permissions | zones (suggest and locked) |
| `PUBLISH_FILTERS` | `async (raw, blobs) → undefined` to publish as is, or what was published instead | silent rounds (seal notes), zones (refuse in a locked zone) |
| `WIRE_INGEST_HOOKS` | `(msg, from, chan)` after a wire message brought new records | mesh forwarding |
| `PRESENCE_FIELDS` | `() → fields` merged into your live presence | attention (Room) |
| `IDENTITY.of` / `personOf` / `samePerson` | key → person | linked devices and recovery; read by permissions, approvals, credit, names |
| `registerPanel({ id, title, blurb, paint, click?, change? })` (ui/panels) | a side panel: one open at a time, repainted on change keeping focus and typed text | every team feature panel |
| `STRIP` / `STRIP_ACTIONS` (ui/hub) | chips in the session strip under the title bar | silent rounds, facilitation, rituals |
| `drawBadge(x, y, text, tone, run?)` / `screenBox(el)` (ui/panels) | clickable labels beside elements | stances, decisions, claims, zones, dependencies, what changed |
| `NODE_KINDS[kind].layout` / `.draw` / `.fit` / `.edit` / `.svg` / `.describe` (render/nodes) | a node kind that lays itself out from its label, draws itself, grows with live data, edits and exports its own way | data nodes |
| `registerDataKind(kind, spec)` (features/data/core) | a data node kind: layout, draw, hit areas, in-place edits, structure form, description, export lines ([DATA.md](DATA.md)) | table, checklist, metric, chart, formula, date, link, code |
| `pipeStep(id, { mode, name, blurb, fields, summary, run })` / `FLOW_RESPONDERS[id] = { name, run }` (features/flow/engine) | a flow action; a responder for Ask and Ideas steps, which is where AI connects ([FLOWS.md](FLOWS.md)) | the built-in steps and responders |
| `RECORD_TYPES[action].say(rec, target)` | what a record did, in words, for the activity log | data records |
| `runHooks(list, …)` | calls each hook, logs and isolates failures | — |

Undo for anything that isn't a plain create, move or style: push `{ kind: 'fn', undo, redo }` onto `S.hist`.

## Adding a feature (checklist)

1. **Format:** specify any new record in PATTERNS.md, including who may author it and how "latest wins" is decided.
2. **Code:** add `js/features/<name>.js` with `@module` and `@uses` headers, and add its `<script>` to `index.html` before `interaction/keyboard.js`. Call `registerFeature` so it appears in the Team hub, and `registerPanel` for its panel (no markup in `index.html` needed).
3. **Records:** call `registerRecord`, then compute the feature's view in a `DERIVE_HOOKS` entry. Skip records in `D.hidden`; follow edits with `current()`.
4. **Interface:** add toolbar buttons, palette commands and keys through the hooks. Put markup in `index.html` and styles in a stylesheet. Use `say()` for screen-reader announcements and `toast()` for visible ones.
5. **Use case:** register a template and, if useful, an example built with `features/builders.js` (no undo noise; examples sign as Ana, Ben and Chen).
6. **Tests:** add a suite in `tests/` that asserts (`node:assert`) and prints `asserted N checks`. Also print `errors [...]` and `axe … [...]` so the runner can fail on them. Suites that only print are compared with golden output in `tests/snapshots/`.
7. **Ship:** run `npm run build && npm run check && npm test && npm run test:source`. CI (`.github/workflows/flux-canvas.yml`) runs the same.

## Components

Each row is one user-facing surface, with the files that own it.

| Component | DOM | JS | CSS | Accessibility contract |
|---|---|---|---|---|
| Canvas | `#c` (role application) | render/*, interaction/* | 01-base | Tab steps through elements; arrows move; every action is announced via `#sr` |
| Tool dock | `#tools` | ui/toolbar (`setTool`, `currentTool`) | 02-toolbar | `role=toolbar`; each tool is a labelled toggle (`aria-pressed`); the tool hint is announced through `#sr` |
| Collaborators + Share | `#corner`, `#menu` | ui/chrome (authors), ui/toolbar (menu) | 02-toolbar | Share is a menu button (`aria-haspopup`, `aria-expanded`); menu has arrow keys, Home/End, Esc returns focus |
| Tooltips | `#tip` | ui/toolbar | 02-toolbar | `aria-hidden`: the button already carries the name; shows on hover and on keyboard focus |
| Title bar | `#titlebar` | features/canvases, brainstorm | 02-toolbar | The title button renames; the vote and timer chips are buttons |
| Welcome card | `#empty` | ui/toolbar, features/canvases | 11-collab | A region with four quick starts; it steps aside on the first touch or key |
| Style bar | `#bar` | ui/bottom-bar (`barGroups`) | 03-bottom-bar | Shows only the groups the tool or selection can use; colour, shape and font are radio groups (arrow keys); sliders have value text |
| Selection toolbar | `#insp` | ui/chrome + `TOOLBAR_HOOKS` | 04-overlays | Labelled icon buttons; ⓘ shows provenance |
| Zoom + overview | `#zoomui`, `#mini` | ui/zoom-minimap | 04-overlays | The overview is decorative; the buttons are labelled |
| Command palette | `#pal` | ui/palette | 05-palette | Combobox and listbox; focus trapped |
| Ledger | `#ledger` | ui/ledger | 06-panels | Rows are buttons |
| Comments | `#comments`, pins, `#previews` | features/comments, comment-pins | 09-comments | Panel is the accessible path; previews are `aria-hidden` |
| Audit | `#audit` | features/audit | 11-collab | Verdict buttons with keys 1/2/3; arrows step |
| Canvas home | `#home` | features/canvases | 11-collab | Dialog, focus trapped, Esc closes, focus returns |
| Report | `#report` | ui/dialogs | 11-collab | Dialog; copy and download |
| Presentation | `#present` | features/story | 11-collab | ← → Space Home End Esc; scenes announced |
| History | `#history` | features/audit | 11-collab | Slider with value text; read-only banner |
| Ask dialog | `#ask` | ui/ask-dialog | 08-a11y-dialogs | Replaces `prompt()`; works in sandboxes |
| Help | `#help` | ui/actions | 07-help-toast | Lists every gesture and key |
| People and permissions | `#people` | features/people | 11-collab | Dialog; one labelled checkbox per person and permission; owner-only editing |
| Outline | `#structure` | features/structure | 06-panels | ARIA tree: arrows, Home/End, Left/Right collapse, Enter shows on canvas (⇧O) |
| Live sync chip | `#netChip` | core/net, ui/toolbar | 02-toolbar | Menu button with connection state in its name |
| Context menu | `#menu` at the pointer | ui/toolbar | 02-toolbar | Right-click, Menu key or Shift+F10; same menu component |

## Module map (load order)

| File | Responsibility |
|---|---|
| core/hooks.js | Extension points. Features register record types, derived views, render layers, |
| core/announce.js | DOM lookup, HTML escaping, the screen-reader announcer and toasts: what every layer may use to talk to people |
| ui/icons.js | The icon set (an SVG sprite in index.html, one stroke style on a 24px grid) and helpers to use it |
| core/encoding.js | base58 / base32 / base64, CIDv1, ints and text escaping, point-array codec, RDP simplification |
| core/grammar.js | Pattern grammar: build() and parse() of ACTION-KEY-VALUE…-SIG patterns with . fences |
| core/ed25519.js | Ed25519 signature verification in plain JS (RFC 8032), for browsers whose WebCrypto lacks Ed25519 |
| core/identity.js | Keys (Ed25519, ECDSA fallback), storage helper, signature verify, Auth Kit signing |
| core/state.js | Record kinds, canvas id, the global state S, BroadcastChannel name |
| core/db.js | IndexedDB: signing keys as non-extractable CryptoKeys, an append-only record log and blobs per canvas, the canvas list |
| core/net.js | Network transport (audit C1): a WebSocket relay that forwards signed records between browsers, plus sync |
| core/rtc.js | Direct peer-to-peer connections (WebRTC data channels): invite and answer codes, no server needed |
| core/blobs.js | CID-addressed blobs: point arrays and images (sniff, decode, cache) |
| core/records.js | Record ingest: parse, verify, address, union-merge; publish; channel wire |
| core/persistence.js | The canvas on disk: an append-only record log in IndexedDB (localStorage in sandboxes), .flux import |
| core/permissions.js | Owned canvases and GRANT permissions (audit S2), enforced in derive() and before signing |
| core/derive.js | Derived view of the record union: hidden, offsets, groups, edits, threads, styles, tree |
| render/geometry.js | Colours, fonts, element boxes, offsets, visibility, hit geometry helpers |
| render/nodes.js | NODE kinds, label layout and auto-size, drawing a node, connector geometry and strokes |
| render/renderer.js | Viewport, drawEl() per record type, frame render loop |
| model/commands.js | Gestures → signed records (commit*), images, revoke, undo/redo, groups |
| interaction/selection.js | Gesture state G, hit testing, modes, keyboard moves, inserts, connect |
| ui/ask-dialog.js | Accessible replacement for prompt(): text or multi-line, works in sandboxes |
| interaction/tools.js | Resize handle and one-shot placement tools (text, comment, node) |
| features/comment-pins.js | Comment pins on the canvas, preview cards and thread thumbnails |
| interaction/pointer.js | Cursor, pointer gestures (draw, shapes, arrows, lasso, move, pinch, pan), wheel |
| interaction/text-editor.js | Free text editor overlay (create and edit TEXT) |
| ui/chrome.js | Signing pill, authors, summary, selection toolbar |
| features/images.js | Insert an image: decode, ask for alt text, re-encode under the blob cap, sign |
| features/clipboard.js | Copy, cut, paste and duplicate as fresh signed records |
| features/arrange.js | Layer order, lock, connector labels, align, distribute, snapping |
| features/eraser.js | Eraser tool |
| ui/zoom-minimap.js | Zoom controls and the overview map |
| features/outline.js | Indented outline → mind map |
| features/presence.js | Presence: named cursors, selections, who is editing what, follow and spotlight (ephemeral, unsigned) |
| features/diagrams.js | + handles, node editor, tidy, templates (NODE kinds and drawing live in render/nodes) |
| features/export-svg.js | Vector export of the visible canvas |
| ui/bottom-bar.js | Contextual style bar: shows only what the current tool or selection can use |
| features/comments.js | Comments panel: threads, replies, resolve, pin moving |
| ui/ledger.js | Ledger panel: every signed record |
| ui/palette.js | Command palette (⌘K) and its command list |
| ui/actions.js | Select all, zoom to fit, theme, verify, export/import, drop, paste |
| ui/dialogs.js | Focus trapping for every modal dialog, and the report dialog (Markdown summaries and audit reports) |
| features/builders.js | Helpers for templates and examples: nodes, connections, frames, groups, comments, votes and |
| features/canvases.js | Canvas titles (META), the canvas home (your canvases, templates, worked examples), example authors |
| features/connectors.js | What a connection means: relation presets (label + colour + dash) and line shape/dash styles |
| features/brainstorm.js | Dot votes and reactions (REACT), a vote budget, a shared timer, and arranging ideas: |
| features/feedback.js | Feedback boards (columns as frames) and the summary: every column's notes ranked by votes, |
| features/story.js | Story building: storyboard template, the story order of frames (connectors first, then reading |
| features/moodboard.js | Moodboards: extract a five-colour palette from an image (swatch nodes), masonry layout, |
| features/audit.js | Audit flows: verdicts on steps (AUDIT), a guided walk along a flow, a report, a signed sign-off |
| features/people.js | People and permissions dialog: who is on the canvas, the owner, and GRANT checkboxes |
| features/profiles.js | Signed PROFILE names per key, shown everywhere instead of key fragments |
| features/session.js | The Live button and session panel: who is here, sync state by state root, invites, peer codes, relay |
| features/work.js | Tasks (TASK), the Work panel, deliveries with named approvers and a quorum (DELIVER, APPROVE), the proof |
| features/compaction.js | Compact your own history (audit D1) and rebuild undo after a reload (audit D3) |
| features/structure.js | Outline panel (audit X2): the canvas as a navigable tree — frames, what sits in them, |
| ui/panels.js | The panel host: registerPanel, one side panel at a time, repaint keeping focus; canvas badges and shared panel helpers |
| ui/form.js | formDialog: a labelled multi-field dialog for features (no <form>, works in sandboxes) |
| ui/hub.js | The Team button (registered features grouped, with live status) and the session strip |
| features/stances.js | Stances and the consensus map: agree, disagree, unsure, alternative, abstain; levels and convergence |
| features/decisions.js | The decision ledger: DECISION and REVIEW, evidence, stances, review dates, decision log |
| features/claims.js | Claim grounding: CLAIM, EVIDENCE, CHECK; independent checks; automatic grounders plug in |
| features/seal.js | Sealed records: SEAL commits to a record’s CID and encrypts it; REVEAL opens it at its time |
| features/rounds.js | Silent-first rounds: notes sealed during the round, all opened together; blind stance rounds |
| features/facilitate.js | Facilitation: role, agenda with time boxes, pull to item, raise-hand queue, floor, note-takers, minutes |
| features/rituals.js | Ritual contracts: required outputs, people and time box; success only when met; the team record |
| features/attention.js | Structural presence (Room): editing, reading, idle, maybe stuck, hot spots; live only |
| features/flows.js | Approval flows: groups, thresholds, order, conditions, escalation; judges deliveries |
| features/contribution.js | Contribution proof: METHOD weights, shares from signed records, CREDIT that recomputes |
| features/payouts.js | Canvas-to-Cash: FUND pledges, PAY terms, SETTLE that recomputes; connectors and manifest |
| features/witness.js | Peer witnesses: WITNESS countersigns a version; each peer checks it against its own records |
| features/excerpt.js | Excerpts with proof: part of a delivery plus the version’s IDs; verification and opening |
| features/mesh.js | Mesh relay: forward new records and live signals to every other connection |
| features/replay.js | Replay: play the canvas back in its rhythm, scoped, with sessions and moments |
| features/since.js | What changed since your last visit, a delivery or a decision, outlined and stepped through |
| features/lineage.js | Lineage forks: copy with original signatures, LINEAGE and FORKED links, INHERIT royalties, pull |
| features/graph.js | The canvas graph: questions across every canvas on this device; signed RESULT |
| features/devices.js | Linked devices and guardian recovery: LINK, GUARD, RECOVER; key → person |
| features/zones.js | Zones and suggest mode: ZONE, ACCEPT; record gate for suggestions and locked areas |
| features/taskflow.js | Task dependencies, ready and blocked work, the critical path, loops |
| features/data/core.js | Data nodes: CELL, TICK, READING, ROW; the derived index, shared drawing, the in-place field, the Data menu |
| features/data/table.js | Tables: rows and columns in the label, cells and rows from anyone, totals |
| features/data/checklist.js | Checklists: items in the label, signed ticks, items from anyone |
| features/data/metric.js | Metrics: readings from anyone, change, target, sparkline |
| features/data/date.js | Dates: a countdown; days from today for formulas |
| features/data/chart.js | Charts: bars, line or donut from values or live from a table, metric or checklist |
| features/data/formula.js | Formulas: an expression over data nodes by name, its own reader, loops reported |
| features/data/link.js | Link cards: http(s) only, opened with one click |
| features/data/code.js | Code snippets: line numbers, fixed width, light colours |
| features/data/templates.js | The Project tracker template |
| features/flow/engine.js | Flows: the graph and run order, the steps (pass, respond, write), responders (where AI connects), RUN and its log |
| features/flow/nodes.js | The Flow node (Run button) and the Step node; adding a step connected to the last |
| features/flow/sandbox.js | Running code safely: a sealed worker for Code steps, sandboxed frames over the canvas, asking before others' code runs |
| features/flow/output.js | The Code step, the Results node (list, table, text, cards, page), the live-code node and its editor |
| features/flow/demos.js | Drop-in flows for writing, coding, design, video, marketing, research, product and meetings |
| features/flow/panel.js | The Flows panel, the live view of a run, palette commands, the Brainstorm flow template |
| ui/toolbar.js | The tool model (select, hand, draw, eraser, rectangle, ellipse, line, sticky note, shapes, text, |
| interaction/keyboard.js | Global keyboard map |
| boot.js | Boot: identity, saved records, first render |
