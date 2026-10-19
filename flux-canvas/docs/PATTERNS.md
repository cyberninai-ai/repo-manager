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

## Authority

`derive()` decides what a record may change. "Latest" means highest `Z`, then CID.

| Rule | Applies to |
|---|---|
| **Author only** | revoke / restore (`-N-1` / `-N-0` on the same action), edits (`-E-`), `STYLE` (incl. lock, layer, label, kind, connector style), `AUDIT` revocation |
| **Anyone** | `MOVE`, `RESOLVE`, `REACT` (their own), `AUDIT` (their own verdict), `META`, `COMMENT`, `SIGNOFF` (their own) |
| **Verified recursively** | every child inside a `GROUP` or `SIGNOFF` fence is parsed, verified and stored on its own |

Planned: owner-issued `GRANT` records limit "anyone" per canvas (audit S2).

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
| `MOVE` | `I R DX DY [DW DH] Z T` | offsets accumulate; `DW`/`DH` resize images and nodes |
| `GROUP` | `I R P Z T` | `P` fences the member elements; moving the group moves them |
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

## Not records

These are never signed or stored. They travel over the channel or stay local:
- presence (cursors);
- the shared timer;
- selection, open panels, the vote budget, the history cursor;
- the canvas list, which is read from local storage for display only.

## Storage and export

The local store and the `.flux` export use the same text: one pattern per line, in Z order, then `BLOB-R-{cid}-B64-{base64}` lines. A `CANVAS-I-R-P-VIEW-T-SIG` pattern fences everything for export. Import is a union: unknown or invalid records are counted and dropped.
