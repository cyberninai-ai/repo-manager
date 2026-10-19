# Flux Canvas — patterns (record format)

Every element, change and decision on a canvas is one **signed pattern**. A canvas is the union of its patterns. There is no file and no server state.

## Grammar

```
ACTION-KEY-value-KEY-value-…-SIG-signature
```

- **ACTION and KEY** are `[A-Z]+`.
- **Values** never contain `-` or `.`:
  - integers: negatives are written `n12`;
  - text: `encodeURIComponent`, with `- . ! ~ * ' ( ) _` also percent-escaped;
  - keys and signatures: base58;
  - CIDs: base32 CIDv1.
- **Fences** nest whole patterns inside a value: `KEY-.CHILD.CHILD.`. A child ends at the `.` before the next uppercase action or the closing `.`. `parse()` handles any depth in one pass.
- **SIG** is always last. It signs the exact bytes before `-SIG-`: Ed25519, or ECDSA P-256 / SHA-256 where Ed25519 is unavailable. The key type is the author id's prefix: `ed…` or `ec…` + base58 public key.
- **Identity:** a record's id is the **CIDv1 (raw codec, sha2-256, base32)** of its full signed bytes. Blobs (point arrays, images) are addressed the same way and checked on arrival.
- **Z** is the author's Lamport counter (layer order and "latest wins"). **T** is wall-clock milliseconds.
- **Plausibility** (audit S3): a record whose `Z` is more than 10,000 past the highest `Z` seen, or whose `T` is more than an hour in the future, waits ("parked") until the canvas catches up, then ingests. It isn't rendered or forwarded while it waits.
- **Verification** works in every browser: where WebCrypto lacks Ed25519, a built-in RFC 8032 verifier checks the signature (audit S4). The ledger lists refused records by reason: malformed, unknown type, bad signature, invalid claim, blob over 2 MB.

## Authority

`derive()` decides what a record may change. "Latest" means highest `Z`, then CID.

| Rule | Applies to |
|---|---|
| **Author only** | revoke / restore (`-N-1` / `-N-0` on the same action), edits (`-E-`), `STYLE` (incl. lock, layer, label, kind, connector style), `AUDIT` revocation |
| **Anyone** | `MOVE`, `RESOLVE`, `REACT` (their own), `AUDIT` (their own verdict), `META`, `COMMENT`, `SIGNOFF` (their own) |
| **Verified recursively** | every child inside a (legacy) `GROUP` or a `SIGNOFF` fence is parsed, verified and stored on its own |
| **Owner only** | `GRANT` on an owned canvas |

### Owned canvases and permissions (audit S2)

A canvas created by this version is **owned**. Its id is `o` + the first 15 base32 characters of `sha256("flux-canvas:" + ownerKey + ":" + nonce)`. An `OWNER` record proves it: it is valid only if its `R` equals that hash of its own author and `K`. Nobody else can produce a valid claim for the id.

On an owned canvas, "anyone" in the table above means "anyone the owner allows". `GRANT` records set permissions per author, or for everyone else (`A-all`). The latest grant per `A` wins. With no grant, a permission is allowed.

| Permission | Covers |
|---|---|
| `draw` | creating and editing elements, `GROUP`, `STYLE`, `META`, moving your own elements |
| `comment` | `COMMENT`, `RESOLVE`, `REACT` |
| `move` | `MOVE` of someone else's element |
| `audit` | `AUDIT`, `SIGNOFF` |

- The owner can always do everything, and anyone can always revoke their own records.
- A grant covers everything an author signed, earlier records included, because `Z` is chosen by the signer and "before the grant" can't be trusted. Records that aren't permitted stay in the ledger, marked "not permitted", and are left out of the view.
- Clients also refuse to sign what the canvas wouldn't show.
- Canvases without an `OWNER` record (older ones, ids typed by hand) stay open. People and permissions offers an owned copy.

## Elements

| Action | Fields | Notes |
|---|---|---|
| `DRAW` | `I R C W Z T` | `R` = CID of the point blob: varint, zigzag delta, 0.5-unit grid, t in ms since pen-down |
| `SHAPE` | `I R K X Y W H C S F Z T` | `K` rect, circle, line; `S` line width; `F` fill colour or `none` |
| `TEXT` | `I X Y M F S C [E] Z T` | `F` font, `S` size; `E` = the version this edit replaces (author only) |
| `ARROW` | `I FROM TO C S M Z T` | connects two element CIDs; follows edits; `M` label |
| `IMAGE` | `I R X Y W H M Z T` | `R` = CID of the image blob; `M` = alt text |
| `NODE` | `I R K X Y W H M C P [E] Z T` | diagram node; `K` card, topic, rect, ellipse, diamond, sticky, button, input, image, swatch, frame; `W`/`H` minimum size (0 = fit label); `P` parent node (the connector is drawn automatically) |

## Changes

| Action | Fields | Effect |
|---|---|---|
| `<same action>` + `N` | `I R N Z T` | `N-1` hides, `N-0` restores; only the target's author; latest wins |
| `MOVE` | `I R DX DY [DW DH] [X] Z T` | offsets accumulate; `DW`/`DH` resize images and nodes. `X` (compaction, audit D1) lists `_`-joined CIDs of the same author's MOVEs on the same target that this one sums up: they no longer count, and every peer may drop them |
| `GROUP` | `I R K Z T` | `K` = the member CIDs joined by `_` (audit D2); moving the group moves them. The older form `I R P Z T` fenced copies of the members and still reads |
| `STYLE` | `I R [W] [C] [K] [O] [L] [M] [Y] [D] Z T` | author-only overrides: width, colour, node kind, layer order, lock, label, connector shape (`curve`, `straight`, `elbow`), dash (`solid`, `dash`, `dot`) |

## Collaboration

| Action | Fields | Effect |
|---|---|---|
| `META` | `I R M K Z T` | `R` = canvas id; `M` title; `K` template; latest wins |
| `COMMENT` | `I ON X Y M RE Z T` | `ON` element (or `0` for the canvas), position relative to it; `RE` thread root for replies |
| `RESOLVE` | `I R S Z T` | `S` 1 resolved / 0 reopened; latest wins |
| `REACT` | `I R E S Z T` | `E` vote, up, idea, love, q, risk; `S` 1 on / 0 off; per author, target and kind the latest wins; the vote budget is a client setting |
| `AUDIT` | `I R V M Z T` | `V` pass, fail, info; `M` note; per auditor and step the latest wins |
| `SIGNOFF` | `I R M P Z T` | `R` = canvas id; `M` summary; `P` fences the `AUDIT` records it attests, so one signature covers the whole audit |
| `OWNER` | `I R K Z T` | `R` = canvas id, `K` = nonce; valid only if the id is the hash of author and nonce |
| `GRANT` | `I R A P Z T` | `R` = canvas id; `A` = author key or `all`; `P` = `draw_comment_move_audit` (any subset) or `none`; owner only; latest per `A` wins |

## Not records

These are never signed or stored. They travel over the channel or stay local:
- presence (cursors);
- the shared timer;
- selection, open panels, the vote budget, the history cursor;
- the canvas list (a summary kept beside the records, for display only);
- sync messages: `HELLO` (the CIDs a peer has) and `records` batches, answered with what is missing.

## Storage and export

- **Local storage:** IndexedDB holds an append-only log: one entry per record (`canvas`, `cid`, `raw`, `z`), blobs beside them (at most 2 MB each), and a canvas summary. Signing keys are non-extractable `CryptoKey`s in the same database (audit S1). In sandboxed frames without IndexedDB, the canvas falls back to one localStorage string. Older localStorage canvases and keys migrate on first open.
- **Export:** the `.flux` export (and the relay's `--data` files) are text: one pattern per line in Z order, with `BLOB-R-{cid}-B64-{base64}` lines. A `CANVAS-I-R-P-VIEW-T-SIG` pattern fences everything for export.
- **Import:** a union. Unknown or invalid records are counted and dropped.
- **Compaction** removes only what no longer counts: your MOVEs folded into one, your `STYLE` and revoke records that a later one fully overrides.
