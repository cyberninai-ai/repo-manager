# Flux Canvas — plan

**Goal:** a collaborative space where people think together. They brainstorm, build ideas, collect feedback, build stories and moodboards, and run audits, and every contribution is a signed record anyone can verify.

The plan is ordered so each phase ships on its own and leaves the app working. Phases 0–15 are done: 0–7 build the collaboration features, 8 the interface, 9–12 resolve the audit, 13–14 make editing and co-work feel native (audit round 3), and 15 adds twenty-one team features ([FEATURES.md](FEATURES.md)). The end lists decisions and next work for the team.

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
- `tests/`: browser suites (14 then, 28 now) plus a runner that fails on page errors or axe violations. They run against the bundle or the source.
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

### 8 · Interface (done)
- A design system: tokens, an 81-icon set, components ([DESIGN.md](DESIGN.md)).
- A real tool dock, a contextual style bar, a Share menu, tooltips with shortcuts, a welcome card with quick starts, a dot grid and clean selection.
- Responsive: the dock moves to the left edge on medium widths and to the bottom on phones.
- **Accept:** `tests/tools.mjs` (25 checks); axe clean in light and dark; screenshots reviewed at desktop, tablet and phone sizes.

### 9 · Storage and keys (done) · audit S1, S5, P2
- Signing keys are non-extractable `CryptoKey`s in IndexedDB. Keys left by older versions are imported and deleted.
- Records are an append-only log in IndexedDB, with blobs (capped at 2 MB) beside them and a canvas summary for the home list. Sandboxes fall back to localStorage.
- **Accept:** `tests/store.mjs`: the key can't be exported, nothing secret sits in localStorage, records reload, the legacy canvas and key migrate, oversized blobs are refused.

### 10 · Integrity and permissions (done) · audit S2, S3, S4
- A built-in Ed25519 verifier for browsers without it.
- Implausible `Z` or `T` is parked until the canvas catches up; refusals are listed by reason.
- Owner-bound canvas ids (an `OWNER` hash commitment) and owner-only `GRANT`s for draw, comment, move and audit, enforced in `derive()` and before signing.
- The People and permissions dialog; an owned copy for older canvases.
- **Accept:** `tests/verify.mjs`, `tests/perm.mjs`: a forged claim is refused, a non-owner grant is ignored, denied work is hidden and then shown once granted.

### 11 · Data and performance (done) · audit D1, D2, D3, P1
- Compaction (MOVEs folded and replaced CIDs dropped by every peer; overridden STYLE and revokes dropped).
- `GROUP` by member CIDs; the undo stack rebuilt after reload.
- Bulk loading derives once; a spatial index for hit testing.
- **Accept:** `tests/data.mjs`: nothing visible changes after compaction, the other tab follows, and undo works after a reload. `tests/perf.mjs`: 5,000 records load in about 0.5 s; derive < 120 ms, render < 40 ms, hit test < 1 ms.

### 12 · Network, boundaries, tests (done) · audit C1, A1, T1, X2
- **Network:** a WebSocket transport with HELLO/records catch-up sync. `tools/relay.mjs` is dependency-free: it serves the app, forwards records and keeps an optional per-canvas log. A live chip; Share → Go live.
- **Boundaries:** `tools/deps.mjs` enforces the core → render → model → app layers and the absence of duplicate globals; [DEPENDENCIES.md](DEPENDENCIES.md) is generated.
- **Tests:** assertions in new suites, golden output for older ones, and CI.
- **Accessibility:** the Outline panel (an ARIA tree of the canvas structure); a context menu reachable by keyboard.
- **Accept:** `tests/net.mjs`: two browsers sync live and after being offline, the relay survives a restart, and a forged record from the relay is refused. `tests/polish.mjs`: outline and context menu. `npm run check` passes.

### 13 · Canvas editing (done) · audit E1–E8
- Drag-to-size shapes, eight-handle resize, marquee, hover outline, fill and text size, type-to-edit, Select as the default tool.
- **Accept:** `tests/tools.mjs`.

### 14 · Live co-work and delivery (done) · audit W1–W9
- **People:** signed `PROFILE` names; presence with selection, editing, view and tool; follow and spotlight; the Live button and session panel.
- **Peer to peer:** WebRTC data channels via swapped codes, next to tabs and the relay; state roots and self-healing resync; "caught up" notices.
- **Work:** `TASK`, the Work panel, `DELIVER` with named approvers and a quorum, `APPROVE` on an exact root, the proof file.
- **Accept:** `tests/cowork.mjs` (two browser contexts over WebRTC).

### 15 · Team features (done) · see FEATURES.md
- **Platform:** `registerFeature` and the Team hub, one panel host, a form dialog, the session strip, canvas badges; core hooks for deliveries, flow conditions, record gates, publish filters, wire ingest, presence fields and identity.
- **Decide:** claim grounding, sealed bids and commitments, decision ledger, consensus map.
- **Meet:** structural presence, silent rounds, facilitated meetings, ritual contracts, zones and suggestions.
- **Deliver:** approval flows, contribution proof, Canvas-to-Cash, peer witnesses, dependencies and critical path, excerpts with proof.
- **Remember and network:** replay, what changed, lineage forks, the canvas graph, linked devices and guardian recovery, the mesh relay.
- **Accept:** `tests/reason.mjs`, `meeting.mjs`, `economy.mjs`, `memory.mjs` (99 checks, two to four people over WebRTC).

### 16 · Data nodes (done) · see DATA.md
- **Kinds:** table, checklist, metric, chart, formula, date, link, code; each a `NODE` kind in its own module under `features/data/`.
- **Values:** `CELL`, `TICK`, `READING`, `ROW` name the node's first version and a row or item by name, so concurrent edits never collide and survive structure edits.
- **Live:** charts follow the table, metric or checklist they connect to; formulas compute across the canvas by name.
- **Interface:** the Data button and D, in-place editing (double-click, Tab), one-click ticks and "+ Add row", the Project tracker template.
- **Accept:** `tests/datanodes.mjs` (36 checks, two people over WebRTC).

### Decisions recorded
- **Transport:** a plain WebSocket relay rather than Gun, untrusted by design because clients verify every record. WebRTC was added in phase 14 as a third transport behind the same `post()`/`onWire()` pair; codes are swapped by hand so no signalling server is needed.
- **ES modules:** deferred. `file://` refuses them, and the shared frame state would need setters everywhere. Enforced layers give the boundary guarantee now.
- **Grants are retroactive:** this is the only rule that a signer-chosen `Z` can't get around.

## Next (for the team)

| Item | Why | Notes |
|---|---|---|
| Passkeys (WebAuthn) as the signing root | Linked devices and guardians cover loss today; a passkey would make the first device recoverable without anyone's help | Sign a per-device key with the passkey; records stay the same |
| End-to-end encryption on the relay | The relay can read what it forwards and stores | Per-canvas symmetric key shared in the link fragment; encrypt `msg` bodies |
| Public anchoring of deliveries | Witnesses date a version among people; a chain dates it for anyone | One transaction per delivery root; a payout connector can do it with the settlement |
| A payout connector (FXN service pool) | Settlements are signed instructions; something must move the money | `PAYOUT_CONNECTORS.push({ name, run })`; the manifest is the input |
| An automatic grounder | Claims are grounded by people today | `GROUNDERS.push({ name, run })`; it signs checks with its own key |
| Time-locked sealing | A sealer who goes offline can't be forced to reveal | Encrypt to a time-lock service (drand tlock) instead of the sealer's key |
| Scoped reveal and private canvases | Sealed records open to everyone; the relay reads plaintext | Per-person encryption keys published with profiles |
| Signalling over the relay | Joining peer to peer without swapping codes by hand | Relay forwards offers and answers only; data stays direct |
| Incremental `derive()` | Only needed past about 50,000 records (a full derive is 1.6 ms at 5,000) | Keep `derive()` pure; memoise per record type |
