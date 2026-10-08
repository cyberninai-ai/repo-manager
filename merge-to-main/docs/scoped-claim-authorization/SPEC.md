# Scoped Claim Authorization: component spec

Status: design draft v0.1 · Stream: *Scoped Claim Authorization Everywhere* (defxn)
Prototype: [`prototype/scoped-claim/index.html`](../../prototype/scoped-claim/index.html)
Contrast gate: [`prototype/scoped-claim/check-contrast.cjs`](../../prototype/scoped-claim/check-contrast.cjs)
Research protocol: [`RESEARCH_PLAN.md`](RESEARCH_PLAN.md)
Platform UI that hosts it: [`docs/defxn/PLATFORM.md`](../defxn/PLATFORM.md)

> **Provenance.** This spec was written without access to the defxn or
> flux-dao-app source. Anything marked **⚑ verify** depends on code it could
> not read (`js/ark/authorization-dialog.js`, `js/ark/fabric-transfer-browser.js`,
> `publish.js`, `IdentitySession.tsx`, `flux-authorization-view.ts`). The
> field set, hierarchy, states and visual contract do not depend on that code
> and are final for review.

---

## 1. The rule

There is **one** signing surface on defxn. Every identity-bound action shows
the same modal, with the same 13 elements in the same order, before any
signature exists. There is no lite, compact, reduced, quick, or inline
variant, and no flag that produces one.

Four invariants follow from that rule:

1. **No hidden fields.** A field with no value renders as an explicit
   `none` (or a refusal, see §5), never as a missing row. A missing row is a
   reduced variant.
2. **No field reordering per action.** Actions change values, not layout.
3. **Sign is only enabled when the browser has recomputed the manifest
   digest from the manifest bytes, and it matches.** The user is shown what
   they will sign, and the browser checks that it matches before it lets them sign.
4. **The bytes shown are the bytes signed.** The "Exact bytes to sign" layer
   renders the same `Uint8Array` passed to the signer, not a re-serialization.

---

## 2. Field contract

The 13 elements, in render order. "Voice" is the font slot: **mono** means
machine-exact (copy it, compare it), **sans** means human-readable.

| # | Element | Group | Default view shows | Voice | Empty / invalid |
|---|---------|-------|--------------------|-------|-----------------|
| 1 | **Action** | What | exact verb, e.g. `founding.directory.publish` | mono, `--primary` chip | refuse: `SCA_MISSING_FIELD` |
| 2 | **Scope** | What | scoped namespace, e.g. `fxn.treasury.transfers` | mono | refuse |
| 3 | **Exact manifest digest** | What | full digest, `sha256:` + 8-char groups | mono | refuse |
| 4 | **Callsign** | Who | callsign (bold) + identity DID | sans + mono sub | refuse |
| 5 | **Requester** | Who | requester name + origin route | sans + mono sub | refuse |
| 6 | **DAO authority** | Who | DAO name + DAO DID / sub-authority | sans + mono sub | refuse |
| 7 | **Network** | Where & limits | network name + network ID | sans + mono sub | refuse |
| 8 | **Configuration** | Where & limits | human label + config pointer | sans + mono sub | refuse |
| 9 | **Visibility** | Where & limits | label + one-line consequence | sans; `--warning` when public | refuse |
| 10 | **Expires** | Where & limits (also pinned in header) | live relative countdown + absolute UTC | mono; `--warning` ≤ 60 s; `--danger` at 0 | refuse |
| 11 | **Inspect claim stack** | Inspect | row: count of claims, root → request | sans | layer shows "no prior claims" only if the request is self-authorized |
| 12 | **Inspect signing manifest** | Inspect | row: byte count | sans; layer body mono | refuse |
| 13 | **Exact bytes to sign** | Inspect | row: byte count | sans; layer body mono (UTF-8 / hex) | refuse |

Every request must carry all 13. A request that cannot fill one is refused
by the wrapper (§5, `SCA_MISSING_FIELD`); the modal never "makes do".

**Mapping to `scopedAuthorizationView`.** ⚑ verify: map each row above to the
key `@deadark/ark-ui/flux-authorization-view.ts` exports, and copy its
label strings verbatim. User-visible label text must match
`ScopedAuthorizationDialog` in flux-dao-app character for character. Any
difference is a bug (per the brief). Where this spec's labels differ from
the SDK's, the SDK wins and this table gets updated.

---

## 3. Information hierarchy

Target: a first-time user can state *what, as whom, under whose authority,
and until when* in **under 10 seconds** without scrolling. The inspection
layers are exhaustive and have no time target.

```
┌ HEADER (pinned, never scrolls) ─────────────────────────────────┐
│ SCOPED CLAIM AUTHORIZATION              [state pill]        ✕   │  meta, mono caps
│ Sign an FXN transfer                                            │  display
│ defxn Treasury is asking KESTREL-7 to sign [transfer] in        │  the 10-second
│ fxn.treasury.transfers under Flux DAO.                          │  sentence
│ DIGEST sha256:78422e42…d950e973        EXPIRES in 4:31          │  pinned anchors
├ BODY (scrolls; inspection layers replace it in place) ──────────┤
│ [state notice: signing / signed / expired / error / refused]    │
│ WHAT YOU'RE SIGNING   Action · Scope · Manifest digest (full)   │
│ WHO                   Callsign · Requester · DAO authority      │
│ WHERE AND LIMITS      Network · Configuration · Visibility ·    │
│                       Expires                                   │
│ → Inspect claim stack        → Inspect signing manifest         │
│ → Exact bytes to sign                                           │
├ FOOTER (pinned) ────────────────────────────────────────────────┤
│ ◆ Digest checked against manifest bytes in your browser         │
│                                      [Cancel]  [Sign transfer]  │
└─────────────────────────────────────────────────────────────────┘
```

Why this order:

- **The lede sentence is the 10-second read.** It is built from fields 5, 4,
  1, 2 and 6, so the most important facts appear twice: once in prose, once
  exact. Research question R4 tests whether it pulls attention *away* from
  the table. If it does, cut it to the action verb only.
- **Digest and expiry are pinned.** They are the two facts that change
  meaning over time (the content and the window). Pinning keeps them in view
  while the user is inside an inspection layer.
- **"What" before "who".** The hypothesis is that users skip the requester and
  authority rows because those fields repeat across requests. Putting the
  action-specific facts first makes the rows that change between requests
  the first thing read. R4 checks this.
- **Visibility carries its consequence inline** ("Every peer on the network
  can look you up by callsign"), because a bare label like "Public" is the
  field most likely to be misread as harmless.

### Inspection layers ("peelable")

- Opening an inspect row replaces the body with that layer **in the same
  modal**. Header (with digest and expiry) and footer (with Sign) stay put.
  Never a second dialog, never a new tab.
- One layer at a time. `← Back to summary` returns, and focus goes back to the row
  that opened it. `Esc` peels the layer first and cancels the modal only
  from the summary.
- Signing from inside a layer is allowed. Opening a layer is never a
  prerequisite for signing (that trains click-through on the layers).
- **Claim stack**: ordered root identity → … → this request. Each entry:
  kind (meta), subject (mono), signed-by line. Signed entries use the filled
  `--trust` diamond, the pending request a hollow `--warning` diamond.
- **Signing manifest**: pretty-printed canonical manifest (mono) plus the
  browser-recomputed digest under it.
- **Exact bytes to sign**: UTF-8 / Hex tabs over the authorization bytes.
  Hex is offset-prefixed, 16 bytes per row.

---

## 4. States

Pre-sign and post-sign are distinct states of the **same** modal. The
field table stays visible in every state, so the receipt is the same
surface the user read.

| State | Pill (token) | Top rule | Body notice | Footer | Enters from | Exits to |
|-------|-------------|----------|-------------|--------|-------------|----------|
| **preview** (unsigned) | "Review before signing" `--primary` | none | none | `◆ digest checked` · Cancel · **Sign ‹action›** | open | signing, refused, expired, error |
| **signing** | "Signing" `--warning` | none | "Waiting for your key … Don't close this tab" | both buttons disabled | Sign | signed, error |
| **signed** (receipt) | "Signed" `--trust` | `--trust` 3px | claim ID, signed-at UTC, full signature, "can't be recalled" | Copy claim ID · **Done** | signing | closed |
| **expired** | "Expired" `--danger` | `--danger` 3px | refusal block, `SCA_EXPIRED` | **Close** | preview (timer hits 0, or Sign pressed after 0) | closed |
| **error** | "Cannot sign" `--danger` | `--danger` 3px | refusal block with code | **Close** | open (validation) or signing (signer error) | closed |
| **refused** (user declined) | "Not signed" `--text-muted` | none | "Nothing was signed … nothing was broadcast" | **Close** | Cancel / ✕ / Esc in preview | closed |

Rules:

- **Refusal block** reuses the existing pattern from the design system: *What
  happened / What's needed / How to fix / Code*.
- **Error codes** (the wrapper's contract):
  `SCA_MISSING_FIELD` (a field is absent; names the field) ·
  `SCA_DIGEST_MISMATCH` (recomputed digest ≠ claimed; copy says *don't sign,
  report it*) · `SCA_NO_CRYPTO` (no `crypto.subtle`; cannot verify, so cannot
  sign) · `SCA_EXPIRED` · `SCA_SIGNER_REJECTED` (browser handle refused or
  locked) · `SCA_BROADCAST_FAILED` (signed but not broadcast; receipt shows
  the signature and a Retry broadcast action, since the signature itself is
  valid). ⚑ verify the last two against the signer's real error surface in
  `fabric-transfer-browser.js` / `publish.js`.
- **Expiry**: countdown ticks every second in both the header and the
  Expires row; turns `--warning` at ≤ 60 s; at 0 the modal moves itself to
  `expired` even if the user is idle or inside a layer. No auto-renew.
  Starting again is always an explicit user action back at the entry point.
- **Signing is not cancellable** once the key handle has the bytes; `Esc` is
  ignored in that state. Cancel is disabled rather than hidden so the layout
  doesn't jump.
- **Focus**: on open, focus goes to the title (`tabindex=-1`), **never** to
  Sign. Focus is trapped (native `<dialog>.showModal()`). On close it
  returns to the invoking control.
- **Announcements**: the state pill and notice are `role=status`; expired and
  error notices are `role=alert`.

---

## 5. Entry-point matrix (IA deliverable 1)

The "today" columns need an audit of defxn's code, which wasn't available
for this draft. The target columns are the spec. Every target row is the
full 13; that is the point.

| Route | Entry point | Action verb | Scope (target) | Visibility (target) | Fields shown today | Gaps vs. full set |
|-------|-------------|-------------|----------------|---------------------|--------------------|-------------------|
| `#/treasury` | Send FXN / Credits | `transfer` | `fxn.treasury.transfers` ⚑ | Public ledger | ⚑ audit `fabric-transfer-browser.js` | ⚑ |
| `#/account` | Send FXN / Credits from personal balance | `transfer` | ⚑ personal scope name | Public ledger | ⚑ audit | ⚑ |
| `#/deposits` | Withdraw / move deposit | `transfer` ⚑ (or a distinct verb, e.g. `deposit.withdraw`) | ⚑ | Public ledger | ⚑ audit | ⚑ |
| `#/deploy` | Deploy / publish site build | `publish` ⚑ | `defxn.site.content` ⚑ | Public | ⚑ audit `publish.js` | ⚑ |
| CMS admin | Publish page / post | `publish` | `defxn.site.content` | Public | ⚑ audit `publish.js` + `authorization-dialog.js` | ⚑ |
| `#/account/directory` **(new)** | Publish identity to mesh directory | `founding.directory.publish` | `founding.directory` | Mesh directory · all peers | n/a (doesn't exist yet) | all 13 (built to spec) |

**How to run the audit** (½ day, engineering + IA):

1. `grep -rn "flux-authorization-dialog\|authorization-dialog\|\.sign(" js/`
   to enumerate every call site that produces a signature. Any call site
   that signs **without** going through the wrapper is a P0 finding and
   joins this table.
2. For each call site, open the modal and record which of the 13 render.
   Record labels verbatim so the copy diff against flux-dao-app (R2) can use
   this table.
3. Grep for reduced-variant switches (`compact`, `lite`, `reduced`,
   `minimal`, `simple`, `variant=`, `hide-`, `skipAuthorization`,
   `autoSign`) in `js/ark/`. Each hit is a removal ticket.

---

## 6. Component anatomy

```
dialog.sca                       native <dialog>, showModal(), ::backdrop scrim
└ .panel[data-state]             glass panel, state drives top rule colour
  ├ header.hd                    pinned
  │ ├ .meta "Scoped claim authorization" · .pill[state] · button.close
  │ ├ h2#sca-title               display slot, action title (sentence case)
  │ ├ p#sca-lede                 the 10-second sentence (sans + mono verb chip)
  │ └ .pinned-digest             DIGEST short-form · EXPIRES countdown
  ├ .bd                          scroll region
  │ └ .layer                     summary OR one peeled layer
  │   ├ .notice[kind]            state notice (signing/signed/expired/error/refused)
  │   ├ section.group × 3        meta heading + dl.fields (dt mono caps / dd)
  │   └ .inspect                 3 rows → layers
  └ footer.ft                    pinned
    ├ .verify[ok|bad]            digest check result (mono)
    └ .actions                   secondary · primary ("Sign ‹action›")
```

- **Primary label always names the verb**: `Sign transfer`,
  `Sign publish`, `Sign founding.directory.publish`. Never "OK",
  "Continue", or "Confirm". Long verbs break at `.` (`<wbr>`), never mid-segment.
- **Digest rendering**: full 64 hex chars in 8-char groups that never split
  across lines; `aria-label` carries the unbroken string for screen readers.
- **Phone (≤ 560 px)**: full-screen sheet, single-column fields, buttons
  stacked full width with Sign on top. Header and footer stay pinned.

## 7. Tokens

The component reads semantic tokens only. It declares no colours of its own.

| Use | Token |
|-----|-------|
| page behind scrim / modal glass base | `--canvas` / `--surface` (94% mix + `backdrop-filter`) |
| field table, chips, code blocks, inspect rows | `--raised` |
| hairlines | `--line` |
| backdrop | `--scrim` at 62% |
| values · labels | `--text` · `--text-muted` |
| action verb, focus ring, primary button | `--primary` (label `--on-primary`) |
| digest verified, signed state, signed claims | `--trust` |
| signing, expiry ≤ 60 s, public visibility, pending claim | `--warning` |
| expired, error, mismatch | `--danger` |
| type slots | `--font-display` (title, layer headings) · `--font-sans` (prose) · `--font-mono` (meta labels, verb, scope, digest, IDs, bytes) |

Meta labels are mono, 11 px, uppercase, `letter-spacing: .08em`, `--text-muted`.

`prototype/scoped-claim/tokens.css` uses the Dead Ark token **names** with
stand-in **values**. On defxn, delete the values and inherit the SDK's.
Then run the pairs in `check-contrast.cjs` through
`tests/theme-color-contrast.cjs` (⚑ verify the pair-list format that test
expects). Current stand-ins pass all 17 pairs in both themes; the lowest
is light `--trust` on `--raised` at 5.37:1. Glass: contrast is measured
against opaque `--surface`; the 94% mix keeps the real ratio within 0.1 of
that.

---

## 8. Engineering contract for `js/ark/authorization-dialog.js`

The wrapper is where "zero reduced variants" is enforced in code, not by
review.

```js
// The only export. Resolves with a receipt or rejects with an SCA_* code.
requestScopedAuthorization({
  requester:     { name, origin },
  network:       { name, id },
  authority:     { name, id },
  configuration: { label, pointer },
  scope, action,
  expiresAt,                       // Date; wrapper refuses if already past
  callsign:      { name, id },
  visibility:    { label, note, public },
  manifestBytes,                   // Uint8Array, canonical
  manifestDigest,                  // claimed 'sha256:…'; wrapper recomputes
  claimStack,                      // [{ kind, subject, signedBy }]
  authorizationBytes,              // Uint8Array; exactly what the signer gets
}) → Promise<{ claimId, signature, signedAt }>
```

- The wrapper validates all fields **before** mounting
  `<flux-authorization-dialog>`; any absence rejects with
  `SCA_MISSING_FIELD:<name>`. No options object, no `variant`, no
  `fields: [...]` subset parameter. There is nothing to configure smaller.
- Recompute `sha256(manifestBytes)` with `crypto.subtle`; mismatch → error
  state. Also check `authorizationBytes` embeds that digest.
- Pass the same `authorizationBytes` reference to the dialog for display and
  to the signer. Don't let either re-serialize.
- ⚑ verify which of these `<flux-authorization-dialog>` already does
  internally, and which attributes/properties it takes for each field. Where
  the element lacks a field (most likely candidates: Visibility consequence
  line, pinned expiry, bytes hex view), the fix goes **upstream in
  `@deadark/ark-ui/elements`** so React and vanilla stay identical, not as a
  defxn-only patch.

**Gate against regressions** (add to defxn CI):

1. A test that calls the wrapper with each field removed in turn and expects
   `SCA_MISSING_FIELD` every time.
2. A grep test that fails if any file outside `js/ark/authorization-dialog.js`
   references the signer directly, or if `js/ark/` contains a
   reduced-variant switch (§5 step 3 word list).
3. A DOM snapshot per action (transfer, publish,
   founding.directory.publish) asserting all 13 elements are present in
   preview.

---

## 9. Identity → mesh directory: the new flow's home

**Route:** `#/account/directory`, a "Mesh directory" section under
Account, next to existing identity settings. Account is where the callsign
already lives. Publishing it is an identity action, not a treasury or CMS one.

**Entry points:**
1. `#/account` → card **"Mesh directory: Not listed"** → *Publish to
   directory*.
2. First-run nudge after a callsign is created: *"Let peers find KESTREL-7"*
   (dismissible, links to 1).

**Flow:**

1. **Preview page** (`#/account/directory`), before any modal:
   - what peers will see: the directory card rendered exactly as it will
     appear (callsign, display name, device keys, links);
   - who can see it: *every peer on Flux mesh · mainnet*;
   - how to change it later: a new publish replaces the entry; removal is a
     separate signed `founding.directory.unpublish` (⚑ confirm the verb
     exists in flux-dao-app).
   - Primary button: **Review and sign**.
2. **Modal**: the standard Scoped Claim Authorization, action
   `founding.directory.publish`, scope `founding.directory`, authority Flux
   DAO · Founding. Nothing about it is special-cased.
3. **Receipt**: on Done, the page shows **"Listed · claim:…"** with the
   signed-at time and a *View in directory* link.

Content ground truth for the manifest and authority fields is
`flux-dao-app/src/components/IdentitySession.tsx` (⚑ verify the manifest
shape in the prototype, which is illustrative, against it).

---

## 10. Definition of done (this stream)

| Item | Where it stands |
|------|-----------------|
| One component spec covering all three surfaces | This document + `sca-dialog.js`, used by all nine entry points in the platform prototype |
| Research report confirming comprehension | Protocol ready in `RESEARCH_PLAN.md`; **no sessions run yet** |
| Identity-to-mesh flow has a home | §9, built in the platform prototype at `#/account/directory` ([PLATFORM.md](../defxn/PLATFORM.md) §4) |
| Zero reduced variants in the codebase | Contract + CI gates in §8; audit procedure in §5; **needs the defxn audit** |
| Light and dark pass contrast | Stand-in tokens pass the local gate; **re-run on defxn with SDK values** |
