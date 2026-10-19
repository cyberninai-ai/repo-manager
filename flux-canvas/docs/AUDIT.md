# Flux Canvas — audit

**Scope.** The whole app as it stood after the diagram and UX passes (one 3,100-line `flux-canvas.html`, 205 KB). The audit covers architecture, data model and security, performance, accessibility, UX and testing.
**Date.** October 2026.
**Method.** I read the code end to end and ran it in headless Chromium: 15 browser suites (now in `tests/`), an axe-core accessibility scan, a sandboxed `srcdoc` frame with a strict CSP, and two-tab sync. Both the bundle and the modular source were tested.

Severity: **High** = can lose or forge data, or blocks the product goal. **Medium** = visible defect or scaling limit. **Low** = polish or debt.

## Summary

The core idea works: every element is a signed, content-addressed record, and the canvas is just the union of those records. That idea is also what makes it robust. Tampered records are rejected, and merging two copies is a set union. Most problems sit around that core:

- **Storage:** keys and records live in `localStorage`.
- **Permissions:** anyone may move, resolve or reorder.
- **Sync:** collaboration only reaches tabs in the same browser.
- **Code structure:** one global scope, which this pass begins to fix.

| # | Area | Finding | Severity | Status |
|---|---|---|---|---|
| A1 | Architecture | One file, one global scope; features reach into each other's state (`S`, `G`, DOM ids) | Medium | **Split into 33 JS + 11 CSS modules in this pass**; explicit imports are next |
| A2 | Architecture | Tests lived outside the repo; no build or check step | Medium | **Fixed**: `tests/`, `tools/build.mjs --check`, `npm test` |
| S1 | Security | Private key stored as an **extractable JWK in `localStorage`**: any script on the origin can copy it | High | Open: move to a non-extractable `CryptoKey` in IndexedDB, later passkeys |
| S2 | Security | `MOVE`, `RESOLVE`, `REACT` and `META` from any author are accepted; nothing implements the spec's permissions model (§8) | High | Open: canvas `GRANT` records from the owner, checked in `derive()` |
| S3 | Integrity | Lamport `Z` and wall-clock `T` are chosen by the signer, so a peer can sign `Z = 10⁹` and win every "latest wins" rule | Medium | Open: clamp `Z` to `max seen + k`, reject `T` far in the future |
| S4 | Integrity | Records from an Ed25519 key are rejected on a browser without Ed25519 verify, so peers can silently diverge | Medium | Open: surface "unverifiable" separately from "invalid"; bundle a small Ed25519 verifier |
| S5 | Availability | Blob size from the wire is unbounded; one large blob can fill the 5 MB `localStorage` quota | Medium | Open: cap blobs (e.g. 2 MB) and move blobs to IndexedDB |
| S6 | Privacy | Presence (cursors) is unsigned and spoofable within the origin | Low | Accepted: ephemeral by design, documented |
| S7 | Injection | All `innerHTML` goes through `esc()`, attributes are double-quoted, and SVG export escapes text and attributes | — | OK |
| D1 | Data | Every drag is a new `MOVE` record and every edit a new record, with no compaction | Medium | Open: signed checkpoint (`SNAPSHOT`) per author |
| D2 | Data | `GROUP` fences copy whole child records, so every grouped element is stored twice | Low | Open: fence CIDs, not full records |
| D3 | Data | Undo history is in memory only and lost on reload (the records themselves persist) | Low | Open: rebuild undo from your own records |
| P1 | Performance | `derive()` recomputes everything on every change; `render()` walks every element; no spatial index | Medium | Open: incremental derive and a quadtree; fine up to a few thousand records today |
| P2 | Performance | Persistence rewrites the whole canvas string on each change (debounced 250 ms) | Medium | Open: append-only log in IndexedDB |
| C1 | Collaboration | Live sync is a `BroadcastChannel`: same browser, same origin only | High | Open: needs a decision on transport (Gun/WebRTC relay), see PLAN |
| X1 | Accessibility | Dialogs restore focus but don't trap it; Tab can leave the palette or ask dialog | Medium | **Fixed in this pass**: one `trapTab` for every dialog (`ui/dialogs.js`) |
| X2 | Accessibility | The canvas content beyond the Tab order (spatial relations) isn't exposed | Low | Partly: summary, announcements, structured outline in the new canvas home |
| X3 | Accessibility | axe-core: 0 violations across canvas, ledger, palette, comments, bar | — | OK |
| U1 | UX | No way to have, name or find several canvases; no examples; a new canvas is a blank page | High | **Fixed in this pass**: canvas home, titles, templates, examples |
| U2 | UX | Notes and ideas connect, but connectors have no meaning (relation type, style) | Medium | **Fixed in this pass**: relation presets, straight/curve/elbow, dashed/dotted |
| U3 | UX | No group decision-making: no votes, reactions, timer or summary | Medium | **Fixed in this pass** |
| U4 | UX | Story and moodboard work isn't supported (no sequence playback, no palette) | Medium | **Fixed in this pass**: present mode, palette extraction, masonry |
| U5 | UX | No audit flow, even though the app's purpose is provable decisions | High | **Fixed in this pass**: audit walk, verdicts, signed sign-off bundle, history scrubber |
| B1 | Bug | SVG export drew node-to-node arrows twice (curve + straight) and dropped the line of labelled non-node arrows | Medium | **Fixed in this pass**: one connector geometry (`connGeom`) for canvas and SVG |
| B2 | Bug | `[hidden]` lost to component `display` rules, so hidden pills showed as empty buttons | Low | **Fixed in this pass**: global `[hidden]{display:none!important}` |
| U6 | UX | The interface read as a developer console: monospace type, glyph icons, hidden modes (pen vs select), an always-on bottom bar with every control, no real tools, a weak empty state, dashed selection boxes | High | **Fixed in the design pass**: design tokens and sans type, a 78-icon set, a tool dock (select, hand, draw, eraser, rectangle, ellipse, line, note, shapes, text, image, comment), a contextual style bar, Share menu, tooltips with shortcuts, a welcome card with quick starts, dot grid, solid selection, panels below the top bar, responsive dock. See [DESIGN.md](DESIGN.md) |
| T1 | Testing | Tests print what they checked; most don't assert values | Medium | Partly: the runner fails on page errors and axe violations; `tests/tools.mjs` asserts (25 checks) and is the pattern for the rest |

## Architecture

**Before:** one inline `<script>`. Function hoisting hid ordering: any function could call any other, and all state was module-global (`S` for the canvas, `G` for the current gesture, many `let` flags).

**After this pass:** 33 ordered classic scripts in `js/` and 11 stylesheets in `css/`. `tools/build.mjs` inlines them into the single `flux-canvas.html`, which is still the artifact people download, open from disk, or host in a sandbox.
- **Why classic scripts and not ES modules:** browsers refuse `<script type="module">` from `file://`.
- **What the order guarantees:** classic scripts share one global lexical scope, so the split needs no code changes. The first build after the split was **byte-identical** to the original file.
- **What it doesn't do yet:** stop a module from reaching into another's internals. Every file carries `@module` and `@uses` headers. Moving to ES modules with explicit imports, served over http, is step 2 in [PLAN.md](PLAN.md).

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
  - Anyone: `MOVE`, `RESOLVE`, `REACT`, `AUDIT`, `META`. This is S2.
- **Verification.** Every record is verified on ingest, and fenced children are verified recursively. A tampered record is rejected and counted in the ledger.

## Performance notes

Measured in headless Chromium on the test canvases (≈60 records): derive under 1 ms, render under 2 ms. The O(n) paths (derive, render, persistence) start to matter in the low thousands of records. P1 and P2 are the fixes. D1 (compaction) keeps the record count from growing with every drag.

## What changed in this pass

See [PLAN.md](PLAN.md) for the phase list and acceptance checks, and [ARCHITECTURE.md](ARCHITECTURE.md) for the module and component map.
