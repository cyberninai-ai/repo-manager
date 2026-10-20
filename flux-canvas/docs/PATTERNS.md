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
| `NODE` | `I R K X Y W H M C P [F] [E] Z T` | diagram node; `K` card, topic, rect, ellipse, diamond, sticky, button, input, image, swatch, frame; `W`/`H` minimum size (0 = fit label); `P` parent node (the connector is drawn automatically); `F` fill `none`, `light` or `solid` |

## Changes

| Action | Fields | Effect |
|---|---|---|
| `<same action>` + `N` | `I R N Z T` | `N-1` hides, `N-0` restores; only the target's author; latest wins |
| `MOVE` | `I R DX DY [DW DH] [X] Z T` | offsets accumulate; `DW`/`DH` resize images and nodes. `X` (compaction, audit D1) lists `_`-joined CIDs of the same author's MOVEs on the same target that this one sums up: they no longer count, and every peer may drop them |
| `GROUP` | `I R K Z T` | `K` = the member CIDs joined by `_` (audit D2); moving the group moves them. The older form `I R P Z T` fenced copies of the members and still reads |
| `STYLE` | `I R [W] [C] [K] [O] [L] [M] [Y] [D] [F] [S] Z T` | author-only overrides: width, colour, node kind, layer order, lock, label, connector shape (`curve`, `straight`, `elbow`), dash (`solid`, `dash`, `dot`), fill (`none`, `light`, `solid`), text size (`s`, `m`, `l`, `xl`) |

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
| `PROFILE` | `I M Z T` | `M` = your display name (40 characters at most); only you can name yourself; latest wins; needs no grant |

## Work and delivery

| Action | Fields | Effect |
|---|---|---|
| `TASK` | `I R S A D Z T` | `R` = element; `S` `todo`, `doing`, `done`, or `x` (no longer a task); `A` owner key or `0`; `D` due date `yyyymmdd` or `0`; latest per element wins; once it exists, only its creator, owner, the element's author or the canvas owner change it; needs `comment` |
| `DELIVER` | `I R M A Q H X [F] [V] Z T` | `R` = nonce; `M` title; `A` = approver keys joined by `_`; `Q` quorum; `H` = the root of the version; `X` = a frame it covers or `0`; `F` an approval flow; `V` = a blob listing the version's CIDs (sorted, one per line; `H` is its SHA-256), so records signed later can't join it; needs `draw` |
| `APPROVE` | `I R H S M [P] [G] Z T` | `R` = the delivery; `H` = the root as the approver computed it; `S` 1 approve / 0 request changes; `M` note; `P` the payment terms it covers; `G` the approvals it came after; counts only from named approvers, latest per approver wins; needs no grant |

A delivery is **approved** when `Q` approvers sign `S-1` with an `H` equal to the delivery's root. It is **changed** when records signed after it alter what it covers; approvals then no longer match the canvas people see.

## Team features

Twenty-one features add their own records; each is specified in its module header and summarised in [FEATURES.md](FEATURES.md). All follow the same rules: signed, content-addressed, verified on ingest, and judged in `derive()` by every peer the same way.

| Action | Fields | Who · rule |
|---|---|---|
| `STANCE` | `I R S M` | `S` agree, disagree, unsure, alt, abstain; per person and target the latest wins · comment |
| `DECISION` / `REVIEW` | `I R M ON E V W P` / `I R S M W` | evidence `E`, reversible `V`, review date `W`, supersedes `P`; reviews keep or reverse · comment |
| `CLAIM` / `EVIDENCE` / `CHECK` | `I R S` / `I R E U S M` / `I R S M` | evidence is an element `E` or a source `U`, supports or refutes; checks by others than the claim's author ground it · comment |
| `SEAL` / `REVEAL` | `I R K C B V W O X Y` / `I R K` | `C` = CID of the sealed record, `B` ciphertext (padded to 512-byte steps), `V` iv, `W` reveal time, `O` the round's CID; only the sealer's reveal counts, opened from `W` on |
| `ROUND` | `I R M E A K ON [P]` | prompt, end, participants, ideas or stances; a round is its first record; only its starter changes its end, with `P` naming it · draw |
| `FACIL` `AGENDA` `NEXT` `HAND` `FLOOR` `SCRIBE` | `P` = role | the role is a chain: the owner's appointment, then handovers each naming the record they continue (`P`); agenda, next item `J`, floor and note-taker `J` name the role they act under; hands by anyone |
| `RITUAL` / `CLOSE` | `I R M U Q E` / `I R O K M` | required outputs `U` (at least one), people `Q`, time box `E`; the starter closes, or a participant after the time box; a success counts only on the outputs `K` names |
| `FLOW` | `I R M G Q C E D` | groups `name~need~key+key`, in order `Q` (a later group's approval must name earlier ones in `G`), conditions `C`, escalation `E` after `D` hours from the first approval · draw |
| `METHOD` / `CREDIT` | `I R M W` / `I R H L K G` | weights per kind of work; credit shares (basis points) over the delivered version, signed by the delivery's author with the approvals `G` it counted; must recompute |
| `FUND` / `PAY` / `SETTLE` | `I R A U M` / `I R A U S P` / `I R H L K U` | amounts in cents; terms by the delivery's author; a settlement names its terms `K`, needs an approved delivery whose approvals name those terms, and lines that recompute |
| `WITNESS` | `I R H C M [D]` | the root of a delivery's version (`D`) or of every record before it; each peer checks it against its own records |
| `INHERIT` / `LINEAGE` / `FORKED` | `I R S Y` / `I R P H C K` / `I R H M` | fork terms by the owner (royalty `Y` in basis points); lineage only from the fork's owner, the first fixes the parent; royalty only if signed by the parent's proven owner |
| `LINK` / `GUARD` / `RECOVER` | `I R S C` / `I R S Q C` / `I R K C` | `C` = the canvas they apply to; mutual links join keys into a person; guardians and threshold; enough guardians (matched by device links only) confirm a new key |
| `ZONE` / `ACCEPT` | `I R S` / `I R S` | open, suggest or locked; the area is the frame's own; by the frame's author or the canvas owner, who is never gated; every overlapping zone's owner must accept |
| `RESULT` | `I Q H C K` | a signed canvas-graph result; never stored on a canvas |

## Data nodes

Tables, checklists, metrics, charts, formulas, dates, links and code are `NODE` kinds whose label holds the data in a readable form; their author changes the structure with a new version. Values change through four records that name the node's first version (`R`), so they survive edits. Rows and items are named by their first cell or text (`Name#2` for a repeat), never by position. Full reference: [DATA.md](DATA.md).

| Action | Fields | Who · rule |
|---|---|---|
| `CELL` | `I R A B M` | row name, column name, value; latest `Z` per row and column wins · draw |
| `TICK` | `I R A S` | item text, done `1` or not `0`; latest `Z` per item wins · draw |
| `READING` | `I R V M` | a plain decimal and a note; all kept in `Z` order · draw |
| `ROW` | `I R M` | tab-separated values: a table row or a checklist item; its author revokes it · draw |

While a node is locked, values signed after the lock take no part. In a zone they are gated like any edit.

`N` is reserved on every record (revoke or restore). Records marked `inherit: false` (ownership, grants, titles, deliveries, approvals, payments, meetings, identity) stay out of forks.

## Not records

These are never signed or stored. They travel over the channel or stay local:
- presence: cursor, name, selection, what is being edited, view, tool, state root, and attention (what you are looking at, how long, idle time) unless you stop sharing it;
- mesh forwarding (hop count and the peer it came through);
- excerpt files and payout manifests (they carry signed records, but are files, not records);
- the shared timer;
- selection, open panels, the vote budget, the history cursor;
- the canvas list (a summary kept beside the records, for display only);
- sync messages: `HELLO` (the CIDs a peer has) and `records` batches, answered with what is missing;
- WebRTC invite and answer codes (`fluxz.` + deflated SDP), swapped by hand.

## Storage and export

- **Local storage:** IndexedDB holds an append-only log: one entry per record (`canvas`, `cid`, `raw`, `z`), blobs beside them (at most 2 MB each), and a canvas summary. Signing keys are non-extractable `CryptoKey`s in the same database (audit S1). In sandboxed frames without IndexedDB, the canvas falls back to one localStorage string. Older localStorage canvases and keys migrate on first open.
- **Export:** the `.flux` export (and the relay's `--data` files) are text: one pattern per line in Z order, with `BLOB-R-{cid}-B64-{base64}` lines. A `CANVAS-I-R-P-VIEW-T-SIG` pattern fences everything for export.
- **Import:** a union. Unknown or invalid records are counted and dropped.
- **Compaction** removes only what no longer counts: your MOVEs folded into one, your `STYLE` and revoke records that a later one fully overrides.
