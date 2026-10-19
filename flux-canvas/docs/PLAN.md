# Flux Canvas — plan

**Goal:** a collaborative space where people think together. They brainstorm, build ideas, collect feedback, build stories and moodboards, and run audits, and every contribution is a signed record anyone can verify.

The plan is ordered so each phase ships on its own and leaves the app working. Phases 0–7 are done in this pass. Phase 8 lists decisions and work for the team.

## Principles

1. **Patterns stay the source of truth.** Every new capability is a record type or a field, specified in [PATTERNS.md](PATTERNS.md), signed and verified like the rest. UI state that isn't shared (selection, panels, timers) is never a record.
2. **One concern per module.** Each feature is a file in `js/features/` with its own stylesheet where it has UI, plus its tests. It reaches the core only through the helpers listed in [ARCHITECTURE.md](ARCHITECTURE.md).
3. **Authority is explicit.** For each record type, `derive()` documents who may do what: author-only or anyone. See the table in PATTERNS.md.
4. **Every feature works by keyboard and screen reader**, and passes the axe scan.
5. **The bundle stays one self-contained file** that opens from disk or a sandboxed viewer.

## Phases

### 0 · Modular source (done)
- `index.html` + `css/` (11 files) + `js/` (core, render, model, interaction, ui, features), in load order.
- `tools/build.mjs` inlines them into `../flux-canvas.html`; `--check` fails CI when the bundle is stale.
- `tests/`: 14 browser suites plus a runner that fails on page errors or axe violations. They run against the bundle or the source.
- **Accept:** the first build is byte-identical to the original file, and both targets pass all suites.

### 1 · Canvases and use cases (done)
- `META` record: canvas title and template, latest wins.
- **Canvas home** (☰, or `H`):
  - your canvases, with title, counts and last change;
  - a new canvas from one of 8 templates;
  - an **Examples** gallery of 6 worked use cases, signed by a separate "Examples" key so their provenance is visible.
- A title pill at the top left; click it to rename.
- **Accept:** you can create, rename, switch, reopen and list canvases; every example opens populated and verifies.

### 2 · Notes and connections (done)
- Double-click empty space in select mode to drop a sticky note. `+` handles, Tab and Alt+arrows connect as before.
- Connector **relations**: supports, contradicts, leads to, depends on, example of, question. Each sets a label, colour and line style in one click.
- Connector **shape** (curve, straight, elbow) and **dash** (solid, dashed, dotted) via `STYLE` fields `Y` and `D`.
- **Accept:** relation presets render on canvas and in the SVG export; style changes are author-only and undoable.

### 3 · Brainstorming (done)
- `REACT` records: dot votes and reactions (👍 💡 ❤️ ❓ ⚠️), one per person per kind per element, toggleable.
- **Dot voting** with a budget per person (default 5, shown as "votes left").
- A **shared timer** for time-boxed rounds (ephemeral, synced over the channel).
- Arrange tools: grid, sort by votes, and cluster into a titled frame.
- **Accept:** votes count per element and per person, the budget is enforced, and the timer appears in every tab.

### 4 · Feedback collecting (done)
- Feedback board template: columns as frames, notes inside.
- **Summary**: every frame, its notes ranked by votes, reactions and comment counts. Copy as Markdown.
- **Accept:** the summary lists each column's notes in vote order and matches the canvas.

### 5 · Story building (done)
- Storyboard template: scene frames with image placeholders and captions, connected in order.
- **Present mode** (`F5` or ⌘K → Present). It steps through frames in connector order (or reading order), fits each one, and shows its title and progress. Use ← → or Space; Esc exits.
- **Accept:** the order follows the connectors and keyboard navigation works.

### 6 · Moodboards (done)
- `swatch` node kind: a colour chip with its hex.
- **Extract palette** from a selected image: five dominant colours via k-means on a downsample, placed as swatches beside it.
- **Masonry** arrange for selected images and notes.
- Moodboard template.
- **Accept:** extraction yields five distinct swatches next to the image; masonry packs the selection into columns.

### 7 · Audit flows (done)
- `AUDIT` records: a verdict (pass, fail, needs info) plus a note, per element per auditor.
- **Audit walk** from a selected start node. It follows the flow (tree links, then arrows) and shows each step with Pass / Fail / Needs info and a note box. Verdict badges appear on the nodes.
- **Report**: counts, failing and open steps, notes and who signed each.
- **Sign-off**: a `SIGNOFF` record whose fence contains every verdict it attests, so one signature covers the whole audit. Copy the report as Markdown.
- **History scrubber**: replay the canvas at any point in its record order (read-only).
- **Accept:** each verdict and the sign-off verify; the report matches the badges; scrubbing back hides later records and returning restores them.

### 8 · Next (for the team)

| Item | Why | Notes |
|---|---|---|
| ES modules with explicit imports | Enforce module boundaries | Serve over http in dev; the build keeps producing the single file |
| IndexedDB storage, non-extractable keys | Audit S1, S5, P2 | Keys as `CryptoKey` in IDB; blobs and an append-only record log in IDB |
| `GRANT` records (permissions) | Audit S2 | Owner-issued grants per canvas: draw, comment, move, audit |
| Network transport | Audit C1 | Decide Gun relay vs WebRTC with a signalling server; the record format doesn't change |
| Compaction (`SNAPSHOT`) | Audit D1 | Per-author signed checkpoint of current state |
| Assertions in tests | Audit T1 | Turn printed checks into `expect` calls; run in CI with `npm run check && npm test` |
