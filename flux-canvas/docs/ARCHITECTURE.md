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
    ui/               chrome, bottom bar, palette, ledger, zoom + overview, dialogs, ask dialog, actions
    features/         one file per capability (diagrams, comments, brainstorm, audit …)
    boot.js
  tools/build.mjs     inlines everything into ../flux-canvas.html (the shipped single file)
  tests/              Playwright suites + runner (bundle or source target)
  docs/               this file, PATTERNS, PLAN, AUDIT, USE-CASES
```

**Commands**

```sh
cd flux-canvas
npm install                 # playwright + axe-core, for tests only
npm run build               # writes ../flux-canvas.html
npm run check               # fails if ../flux-canvas.html is stale (use in CI)
npm test                    # all suites against the bundle
npm run test:source         # all suites against the modular source, served over http
npm run serve               # http://localhost:8080 for development
```

The app has no runtime dependencies and no build step to run it: open `index.html` (or the bundle) from disk.

## Why classic scripts, and what that means

The bundle has to open from `file://` and inside sandboxed viewers. Browsers refuse `type="module"` from `file://`. So the source is **ordered classic scripts that share one global scope**:

- A file may use anything declared in an earlier file, at load time or later. It may use anything declared in a later file only at runtime, inside a function that runs after load.
- `index.html` is the single source of truth for load order. `tools/build.mjs` follows it.
- Each file starts with `'use strict'`, an `// @module` line saying what it is, and `// @uses` listing what it leans on. Keep them accurate. They are the documentation of the dependency graph until step 8 of the plan moves to ES modules.

## Data flow

```
pointer / keyboard / palette
        │
        ▼
 command  (model/commands, features/*)        e.g. commitNode, toggleReact, giveVerdict
        │  signed(action, pairs)  → ACTION-…-SIG-sig      (core/identity)
        ▼
 publish(raw, blobs)  ─────────► BroadcastChannel  ───► other tabs: onWire → ingest
        │                                                                (core/records)
        ▼
 ingest: parse → verify signature → CID → toRec (+ feature parsers) → S.records
        │  changed()  (microtask)
        ▼
 derive(): S.records → S.D  (hidden, offsets, groups, edits, threads, styles, tree, + DERIVE_HOOKS)
        │  dirty = true
        ▼
 render(): S.D.els → canvas (+ RENDER_HOOKS.world / .screen) · inspector · previews · bar · overview
```

Rules that keep peers consistent:

1. **Nothing renders from local intent.** Your own stroke is drawn as a ghost until it has been signed and ingested, exactly like a peer's.
2. **`derive()` is a pure function of `S.records`** (plus the history cursor `S.histZ`). It decides authority: who may revoke, edit, restyle, move. Never mutate records elsewhere.
3. **UI state is never a record:** selection, open panels, timers, presence and the vote budget. Shared ephemeral state goes over the channel through `WIRE_HOOKS`.

## Global state

| Name | Where | What |
|---|---|---|
| `S` | core/state | The canvas: `records`, `blobs`, `view`, tool settings, `sel`, `hist`/`redo`, `D` (the derived view) |
| `S.D` | core/derive | `els` (z order), `hidden`, `off`, `groupOf`, `next`/`superseded` (edits), `threads`, `kids` (tree), plus feature views: `reactions`, `audits`, `signoffs`, `meta` |
| `G` | interaction/selection | The gesture in progress (`kind`: stroke, move, resize, lasso, grow, pin, erase …) |
| `canvasId`, `bc` | core/state | Current canvas and its channel |

## Extension points (core/hooks.js)

A feature registers here and needs no edits to the core:

| Hook | Signature | Used by |
|---|---|---|
| `registerRecord(action, { parse, fence? })` | adds a record type; `fence` names the action allowed inside its `P` fence (verified one by one) | canvases (META), brainstorm (REACT), audit (AUDIT, SIGNOFF) |
| `DERIVE_HOOKS` | `(D, byType)` after the core derive | reactions, verdicts, sign-offs, canvas title |
| `RENDER_HOOKS.world` / `.screen` | `(z)` / `()` | reaction chips, verdict badges |
| `POINTER_HOOKS` | `(e, w) → true` if handled | chip toggling, presentation clicks |
| `TOOLBAR_HOOKS` / `TOOLBAR_ACTIONS` | buttons HTML / `async (rs, button)` | relations, votes, reactions, arrange, palette, masonry |
| `PALETTE_HOOKS` | `(add)` | every feature's commands |
| `KEY_HOOKS` | `(e, { onCanvas, mod, k }) → true` | H, D, A, ⇧H, ⇧S, F5, presentation keys |
| `WIRE_HOOKS[key]` | ephemeral channel messages | shared timer |
| `TEMPLATES` / `EXAMPLES` | canvas home cards | every use case |
| `NAMES` | author key → display name | example authors |
| `runHooks(list, …)` | calls each hook, logs and isolates failures | — |

Undo for anything that isn't a plain create, move or style: push `{ kind: 'fn', undo, redo }` onto `S.hist`.

## Adding a feature (checklist)

1. **Format:** specify any new record in PATTERNS.md, including who may author it and how "latest wins" is decided.
2. **Code:** add `js/features/<name>.js` with `@module` and `@uses` headers, and add its `<script>` to `index.html` before `interaction/keyboard.js`.
3. **Records:** call `registerRecord`, then compute the feature's view in a `DERIVE_HOOKS` entry. Skip records in `D.hidden`; follow edits with `current()`.
4. **Interface:** add toolbar buttons, palette commands and keys through the hooks. Put markup in `index.html` and styles in a stylesheet. Use `say()` for screen-reader announcements and `toast()` for visible ones.
5. **Use case:** register a template and, if useful, an example built with `features/builders.js` (no undo noise; examples sign as Ana, Ben and Chen).
6. **Tests:** add a suite in `tests/`. Print `errors [...]` and `axe … [...]` so the runner can fail on them.
7. **Ship:** run `npm run build && npm test && npm run test:source`.

## Components

Each row is one user-facing surface, with the files that own it.

| Component | DOM | JS | CSS | Accessibility contract |
|---|---|---|---|---|
| Canvas | `#c` (role application) | render/*, interaction/* | 01-base | Tab steps through elements; arrows move; every action is announced via `#sr` |
| Top toolbar | `#corner` | ui/chrome, interaction/tools | 02-toolbar | Labelled buttons; `aria-pressed` on tools |
| Title bar | `#titlebar` | features/canvases, brainstorm | 11-collab | The title button renames; the vote and timer pills are buttons |
| Bottom bar | `#bar` | ui/bottom-bar | 03-bottom-bar | Colour and shape are radio groups (arrow keys); sliders have value text |
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

## Module map (load order)

| File | Responsibility |
|---|---|
| core/hooks.js | Extension points |
| core/encoding.js | base58 / base32 / base64, CIDv1, ints and text escaping, point-array codec, RDP simplification |
| core/grammar.js | `build()` / `parse()` of `ACTION-KEY-VALUE…-SIG` patterns with `.` fences |
| core/identity.js | Keys (Ed25519, ECDSA fallback), storage, verify, Auth Kit signing |
| core/state.js | Record kinds, canvas id, `S`, channel name |
| core/blobs.js | CID-addressed blobs: point arrays and images |
| core/records.js | Ingest (parse, verify, address, union-merge), publish, channel wire |
| core/persistence.js | Local storage of records and blobs, `.flux` import |
| core/derive.js | The derived view |
| render/geometry.js | Colours, fonts, boxes, offsets, visibility |
| render/renderer.js | Viewport, `drawEl()`, frame loop |
| model/commands.js | `commit*`, images, revoke, undo/redo, groups |
| interaction/selection.js | Gesture state, hit testing, modes, keyboard moves |
| ui/ask-dialog.js | Accessible `prompt()` |
| interaction/tools.js | Resize handle, one-shot placement tools |
| features/comment-pins.js | Pins, preview cards, thread thumbnails |
| interaction/pointer.js | Pointer gestures, wheel |
| interaction/text-editor.js | Free text editor |
| ui/chrome.js | `$`, announcer, toast, signing pill, authors, selection toolbar |
| features/clipboard.js | Copy, cut, paste, duplicate |
| features/arrange.js | Layer order, lock, labels, align, distribute, snapping |
| features/eraser.js | Eraser |
| ui/zoom-minimap.js | Zoom controls, overview |
| features/outline.js | Outline → mind map |
| features/presence.js | Live cursors |
| features/diagrams.js | NODE kinds, auto-size, connector geometry, `+` handles, node editor, tidy, templates |
| features/export-svg.js | SVG export |
| ui/bottom-bar.js | Colour, shape, brush and text size |
| features/comments.js | Comments panel |
| ui/ledger.js | Ledger |
| ui/palette.js | Command palette |
| ui/actions.js | Select all, fit, theme, verify, export/import, drop, paste |
| ui/dialogs.js | Focus trapping, report dialog |
| features/builders.js | Helpers for templates and examples; generated illustrations |
| features/canvases.js | META titles, canvas home, example authors |
| features/connectors.js | Relation presets, line shape and dash |
| features/brainstorm.js | REACT votes and reactions, budget, timer, grid / sort / cluster |
| features/feedback.js | Feedback board, Markdown summary |
| features/story.js | Storyboard, story order, presentation |
| features/moodboard.js | Palette extraction, masonry, swatches |
| features/audit.js | AUDIT verdicts, audit walk, report, SIGNOFF, history |
| interaction/keyboard.js | Global keymap (feature keys come first via `KEY_HOOKS`) |
| boot.js | Identity, saved records, first render |
