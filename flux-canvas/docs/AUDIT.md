# Flux Canvas — audit

**Scope.** The whole app, first as one 3,100-line `flux-canvas.html` (205 KB), then re-checked after every pass. The audit covers architecture, data model and security, performance, accessibility, UX and testing. Every finding below is now fixed or accepted with a reason.
**Date.** October 2026 (re-audited after the fixes).
**Method.** I read the code end to end and ran it in headless Chromium: 24 browser suites in `tests/`, an axe-core accessibility scan, a sandboxed `srcdoc` frame with a strict CSP, two-tab sync, two-browser sync through the relay, and a 5,000-record benchmark. Both the bundle and the modular source were tested.

Severity: **High** = can lose or forge data, or blocks the product goal. **Medium** = visible defect or scaling limit. **Low** = polish or debt.

## Summary

The core idea works: every element is a signed, content-addressed record, and the canvas is just the union of those records. That idea is also what makes it robust. Tampered records are rejected, and merging two copies is a set union. The first audit found that most problems sat around that core, and every one is now addressed:

| What the audit found | What it is now |
|---|---|
| Storage: keys and records in `localStorage` | Non-extractable keys and an append-only log, both in IndexedDB |
| Permissions: anyone could move, resolve or reorder | Owner-bound canvases with signed `GRANT`s, enforced in `derive()` |
| Sync: only tabs in the same browser | A WebSocket relay with catch-up sync between browsers |
| Code structure: one global scope | 59 modules in enforced layers |

| # | Area | Finding | Severity | Status |
|---|---|---|---|---|
| A1 | Architecture | One file, one global scope; features reach into each other's state (`S`, `G`, DOM ids) | Medium | **Fixed**: 59 JS + 12 CSS modules, and layers (core → render → model → app) enforced by `tools/deps.mjs` in `npm run check`. 28 upward reaches were removed through hooks and moves; [DEPENDENCIES.md](DEPENDENCIES.md) is generated. ES modules stay deferred by decision (see ARCHITECTURE) |
| A2 | Architecture | Tests lived outside the repo; no build or check step | Medium | **Fixed**: `tests/`, `tools/build.mjs --check`, `npm test`, CI workflow |
| S1 | Security | Private key stored as an **extractable JWK in `localStorage`**: any script on the origin can copy it | High | **Fixed**: a non-extractable `CryptoKey` in IndexedDB; old JWKs are imported and deleted. Fallback to a JWK only where IndexedDB is missing (sandboxed frames) |
| S2 | Security | `MOVE`, `RESOLVE`, `REACT` and `META` from any author are accepted; nothing implements the spec's permissions model (§8) | High | **Fixed**: owner-bound canvas ids (`OWNER` record, a hash commitment), owner-only `GRANT` records (draw, comment, move, audit), enforced in `derive()` and before signing; People and permissions dialog; owned copy of older canvases |
| S3 | Integrity | Lamport `Z` and wall-clock `T` are chosen by the signer, so a peer can sign `Z = 10⁹` and win every "latest wins" rule | Medium | **Fixed**: `Z` more than 10,000 past the highest seen, or `T` more than 1 h ahead, is parked until plausible; the ledger shows waiting records |
| S4 | Integrity | Records from an Ed25519 key are rejected on a browser without Ed25519 verify, so peers can silently diverge | Medium | **Fixed**: built-in RFC 8032 verifier (checked against WebCrypto, ~4 ms per signature); the ledger reports refusals by reason |
| S5 | Availability | Blob size from the wire is unbounded; one large blob can fill the 5 MB `localStorage` quota | Medium | **Fixed**: blobs over 2 MB are refused; images re-encode to fit; blobs live in IndexedDB |
| S6 | Privacy | Presence (cursors) is unsigned and spoofable | Low | Accepted: ephemeral by design; it now also crosses the relay, still unsigned and never stored |
| S7 | Injection | All `innerHTML` goes through `esc()`, attributes are double-quoted, and SVG export escapes text and attributes | — | OK |
| D1 | Data | Every drag is a new `MOVE` record and every edit a new record, with no compaction | Medium | **Fixed**: "Compact my history" folds your MOVEs per element into one signed MOVE (`X` lists the replaced CIDs, which peers drop) and drops overridden STYLE and revoke records; offered from the ledger |
| D2 | Data | `GROUP` fences copy whole child records, so every grouped element is stored twice | Low | **Fixed**: `GROUP` lists member CIDs (`K`); the older form still reads |
| D3 | Data | Undo history is in memory only and lost on reload (the records themselves persist) | Low | **Fixed**: the undo stack is rebuilt from your own records on load |
| P1 | Performance | `derive()` recomputes everything on every change; `render()` walks every element; no spatial index | Medium | **Fixed** where it mattered. Bulk loads derive once (5,000 records: 4.7 s → 0.5 s), and a grid spatial index makes hit tests 40× faster (0.63 → 0.015 ms). A full derive is 1.6 ms at 5,000 records, so incremental derive isn't needed yet. `tests/perf.mjs` guards the budgets |
| P2 | Performance | Persistence rewrites the whole canvas string on each change (debounced 250 ms) | Medium | **Fixed**: append-only IndexedDB log; each change writes only its own records |
| C1 | Collaboration | Live sync is a `BroadcastChannel`: same browser, same origin only | High | **Fixed**: WebSocket transport with HELLO/records sync; `tools/relay.mjs` is a dependency-free relay that serves the app, forwards records and keeps a per-canvas log (`--data`). The relay is untrusted: clients verify everything |
| X1 | Accessibility | Dialogs restore focus but don't trap it; Tab can leave the palette or ask dialog | Medium | **Fixed**: one `trapTab` for every dialog |
| X2 | Accessibility | The canvas content beyond the Tab order (spatial relations) isn't exposed | Low | **Fixed**: Outline panel (⇧O), an ARIA tree of frames, their contents in reading order, connections with their meaning, votes and comments |
| X3 | Accessibility | axe-core: 0 violations across canvas, ledger, palette, comments, bar | — | OK, now also for the people dialog, outline, menus and the redesigned chrome |
| U1–U5 | UX | No canvases or examples; connectors without meaning; no group decisions; no story or moodboard support; no audit flow | High | **Fixed** in the collaboration pass (see PLAN phases 1–7) |
| U6 | UX | The interface read as a developer console: monospace type, glyph icons, hidden modes, an always-on bottom bar, no real tools | High | **Fixed** in the design pass: design system, icon set, tool dock, contextual style bar, Share menu, tooltips, welcome card, context menu, outline. See [DESIGN.md](DESIGN.md) |
| B1 | Bug | SVG export drew node-to-node arrows twice and dropped the line of labelled non-node arrows | Medium | **Fixed**: one connector geometry (`connGeom`) for canvas and SVG |
| B2 | Bug | `[hidden]` lost to component `display` rules | Low | **Fixed**: global `[hidden]{display:none!important}` |
| B3 | Bug | Avatar initials disappeared (a contrast fix had commented them out) | Low | **Fixed**; the people dialog and avatars share one `initials()` |
| T1 | Testing | Tests print what they checked; most don't assert values | Medium | **Fixed**: 8 suites assert (`node:assert`); the 15 older suites are compared with golden output (normalised for keys, CIDs and times) in `tests/snapshots/`; CI runs check plus both targets |

## Round 3: collaboration-native and canvas editing

**Why a third round.** The first two rounds made the app correct and usable. The feedback after them was that it still *felt* like a web2 whiteboard: one person on one device, drawing alone, with sign-off happening somewhere else. Editing the canvas (placing shapes, sizing, styling) was also called out as poor. This round audits against the product goal instead: real time, peer to peer, people co-working until the work is delivered and proven. [PRODUCT.md](PRODUCT.md) states that goal in plain words.

### Collaboration (W)

| # | Finding | Severity | Status |
|---|---|---|---|
| W1 | People were key fragments (`k2a9f…`). Nobody could tell who was who | High | **Fixed**: a signed `PROFILE` record per key (only you can name yourself, latest wins). Names show on cursors, avatars, the activity feed, tasks and approvals. Your name travels with your first contribution |
| W2 | Sync needed a server: tabs in one browser, or a relay someone had to run | High | **Fixed**: direct WebRTC data channels. One person creates an invite code, the other answers with a code (about 650 characters, deflated), and records, presence and sync flow browser to browser. Tabs and the relay still work; `post()` sends on all three |
| W3 | No sense of being together: cursors only, no idea what others were doing | High | **Fixed**: presence carries name, selection, what is being edited, view and tool. Others' selections are outlined in their colour with "Ana is editing"; you can **Follow** someone or **Bring everyone to my view** |
| W4 | No single place showing who is here and whether everyone sees the same thing | Medium | **Fixed**: the Live button (`Just you`, `Live · 3`, `Syncing · 3`) opens the session panel: you, people here, how each is connected, invites, peer codes and the relay |
| W5 | No way to know two peers hold the same canvas | Medium | **Fixed**: a state root (a hash of every record CID) in presence. Equal roots read "everyone sees state HJBC7Q". A root that differs for 2.5 s triggers a resync, so sync heals itself |
| W6 | Coming back gave no account of what happened | Medium | **Fixed**: "Caught up · 12 changes from Ana, Ben" after a sync batch; the Activity feed reads as sentences ("Ana added a note "Pricing"") with avatars |
| W7 | Work stopped at ideas: nothing tracked who does what by when | High | **Fixed**: `TASK` records turn any element into a task with status, owner and due date. A chip on the canvas advances it; the Work panel lists tasks by status, mine first |
| W8 | Sign-off happened outside the canvas and wasn't tied to a version | High | **Fixed**: `DELIVER` names approvers and a quorum and pins the state root at that moment. Each approver signs `APPROVE` over the root they computed themselves; later edits mark the delivery as changed. The proof file lists the version, contributors and signed approvals |
| W9 | "Who did this?" needed the ledger | Low | **Fixed**: hovering someone else's element shows their name; your own work stays unlabelled |

### Canvas editing (E)

| # | Finding | Severity | Status |
|---|---|---|---|
| E1 | Shapes landed at a fixed size; you couldn't drag out a box | High | **Fixed**: drag to size with every shape tool (Shift keeps proportions); a click places a sensible default |
| E2 | Only the bottom-right corner resized, and resize committed the wrong size | High | **Fixed**: eight handles with matching cursors on nodes, shapes and images; the commit measures against the drawn size, not the stored minimum |
| E3 | No marquee: selecting many things meant Shift-clicking each | High | **Fixed**: drag on empty paper to select; Select is the default tool |
| E4 | Shapes were outlines only, and text had one size | Medium | **Fixed**: fill (none, light, solid) and text size (S, M, L, XL) in the style bar, signed as `STYLE` `F` and `S`; new nodes take `F` at creation; text picks a readable colour on solid fills |
| E5 | Picking a colour or kind while something was selected restyled it by surprise | Medium | **Fixed**: choosing a creation tool clears the selection; the style bar then sets what you draw next |
| E6 | Typing on a selected blank shape lost the first characters | Medium | **Fixed**: type-to-edit writes the first key into the editor at once |
| E7 | Right-click on empty paper kept the old selection, so the menu acted on it | Low | **Fixed** |
| E8 | No hover feedback: it wasn't clear what a click would hit | Low | **Fixed**: a hover outline, with handles only when the pointer is near |

### Tests added this round

- `tests/tools.mjs`: drag-to-size, eight-handle resize, marquee, fill and text size, hover, type-to-edit.
- `tests/cowork.mjs` (15 checks): profiles and names, a WebRTC connection made by swapping codes between two browser contexts, records and presence over it, equal state roots, tasks, a two-of-two delivery that is changed after one approval, and the proof.

### Still open from this round

- **Not a blockchain.** The proof is verifiable offline, but nothing timestamps it publicly. Anchoring a delivery's root on a public chain is the next step (see PRODUCT).
- **Presence is unsigned** (S6 still holds). Names on cursors come from signed `PROFILE` records, but a peer could send a fake cursor.
- **Direct connections need a code swap.** Two people must exchange codes through some other channel. With a relay or a hosted link, joining is one click.

## Residual risks (accepted, documented)

- **No key backup.** A non-extractable key can't be exported, so clearing site data loses that identity. The records stay valid; that person signs on with a new key. Next step: passkeys (WebAuthn) as the signing root.
- **The relay keeps plaintext.** The relay can read canvases it serves and keeps them in `--data` files. It can't forge or alter records. Run it where the content may be stored, or add end-to-end encryption later.
- **Grants are retroactive.** Removing someone's permission hides their earlier work too, until the grant is given back. This is the only rule that backdated `Z` can't get around.
- **Plausibility slack.** Within 10,000 Lamport steps a signer still picks its own order. That is enough room to sync normally, but not enough to jump ahead indefinitely.

## Architecture

**Before:** one inline `<script>`. Function hoisting hid ordering: any function could call any other, and all state was module-global (`S` for the canvas, `G` for the current gesture, many `let` flags).

**Now:** 59 ordered classic scripts in `js/` and 12 stylesheets in `css/`. `tools/build.mjs` inlines them into the single `flux-canvas.html`, which is still the artifact people download, open from disk, or host in a sandbox.
- **Why classic scripts and not ES modules:** browsers refuse `<script type="module">` from `file://`.
- **What the order guarantees:** classic scripts share one global lexical scope, so the split needed no code changes. The first build after the split was **byte-identical** to the original file.
- **What keeps modules apart:** `tools/deps.mjs` derives the dependency graph from the source and fails `npm run check` when a lower layer reaches up, or when two files declare the same name.

The data flow is clean and worth keeping:

```
gesture / key ─► command (model/commands, features/*) ─► signed(pattern) ─► publish
                                                                              │
             render ◄─ derive (core/derive) ◄─ ingest: parse · verify · CID ◄─┘◄── channel / import / storage
```

Nothing renders from local intent. Even your own stroke appears only after it has been signed and ingested like a peer's. That keeps every peer consistent.

## Data model and security notes

- **Grammar.** `ACTION-KEY-VALUE-…-SIG-sig`, with values free of `-` and `.`, and fences `.child.child.`. It parses in one pass and needs no escaping beyond `encTxt`. See [PATTERNS.md](PATTERNS.md).
- **Addressing.** An element's id is the CIDv1 (raw, sha2-256) of its signed bytes. Blobs (points, images) are addressed the same way and checked on arrival.
- **Authority rules in `derive()`:**
  - Author-only: revoke (`-N-`), edits (`-E-`), `STYLE`, lock, order, labels.
  - Owner-only: `GRANT`.
  - Everything else: as the canvas owner's grants allow (open on canvases without an owner).
- **Verification.** Every record is verified on ingest, in every browser (JS Ed25519 where WebCrypto lacks it), and fenced children are verified recursively. A tampered record is refused and counted in the ledger with its reason. Implausible clocks wait.

## Performance notes

Measured in headless Chromium with 5,000 signed notes and shapes (`tests/perf.mjs`):

| | Before | Now |
|---|---|---|
| Load: verify, ingest, derive | 4.7 s | 0.5 s |
| `derive()` | 1.6 ms | 1.6 ms |
| Render, viewport at 100% | 4.3 ms | 2.7–3.7 ms |
| Render, everything visible (10%) | 34 ms | 17–22 ms |
| Hit test | 0.63 ms | 0.015 ms |

Persistence writes only new records. Compaction keeps drags from growing the record count without limit.

## What changed in this pass

See [PLAN.md](PLAN.md) for the phase list and acceptance checks. Phases 9–12 are the audit fixes. [ARCHITECTURE.md](ARCHITECTURE.md) has the module and component map, and [DESIGN.md](DESIGN.md) the interface.
