# defxn platform UI

Status: design draft v0.1 · Prototype: [`prototype/defxn/index.html`](../../prototype/defxn/index.html)
Signing surface: [`docs/scoped-claim-authorization/SPEC.md`](../scoped-claim-authorization/SPEC.md)

> **Provenance.** Designed without access to the defxn source. Routes come
> from the stream brief (`#/account`, `#/treasury`, `#/deposits`, `#/deploy`,
> CMS admin, and the new directory flow). Page content, balances, roles and
> policies are illustrative. Where real defxn behaviour differs (for example,
> what a deposit actually issues), the page structure still holds and the
> copy changes.

```sh
cd prototype && python3 -m http.server 8000
# open http://localhost:8000/defxn/   (http(s) is needed for crypto.subtle)
```

Every signing action in the prototype runs the real dialog: the digest is
computed in the browser, and the result updates balances, ledgers, page
status, deploy history and the claims record. Data lives in `localStorage`;
**Reset demo data** in the sidebar starts over.

---

## 1. Principles

1. **Signing is visible before it happens.** Any button that leads to a
   signature carries the `◇` glyph and says "Review and sign ‹what›". Every
   such form ends with a dashed **sign note** naming the callsign and
   authority the user is about to act as. No button signs directly; they all
   open the one dialog.
2. **Local vs. signed is always explicit.** Drafts, form input and preview
   are "this browser". Only a signature changes what others see. Copy says
   which one each action is ("Saving a draft signs nothing").
3. **The record is first-class.** Everything signed lands in **Signed
   claims** with its claim ID, scope and digest. Tables that show
   signed things (ledgers, deploy history, publish history) carry the
   claim ID column.
4. **Authority is shown, not implied.** Account shows the user's authority
   chain in the same visual language as the dialog's claim stack, so the
   stack in the dialog is never the first time they see it.
5. **One component vocabulary.** Same tokens, buttons, chips and mono rules
   as the dialog. The page and the signing surface read as one product.

---

## 2. Information architecture

```
defxn
├── You
│   ├── Overview            #/                    balances · waiting on you · recently signed
│   ├── Account             #/account             balances · send · identity · device keys · authority chain
│   └── Directory           #/account/directory   entry editor · live peer preview · publish / update / remove
├── Flux DAO
│   ├── Treasury            #/treasury            DAO balances · daily cap · send · policy · ledger
│   └── Deposits            #/deposits            pool totals · deposits table · withdraw · new deposit
├── Site
│   ├── Content (CMS)       #/content             pages with status
│   │   └── Editor          #/content/<slug>      edit · live preview · save draft · publish · history
│   └── Deploy              #/deploy              live build · staged build · deploy · history · roll back
└── Record
    └── Signed claims       #/activity            every claim, filterable, expandable receipt
```

Sidebar groups follow who the action is on behalf of: **You** (your own
identity and funds), **Flux DAO** (shared funds, under a DAO role), **Site**
(defxn's public content, under an editorial role), **Record**. Under 900 px
the sidebar becomes a horizontally scrolling tab bar under the top bar.

**Badges** on Directory, Content and Deploy count items waiting on the user
(not listed, unpublished pages, staged build). They mirror the Overview's
"Waiting on you" list, which links straight to each item.

### Shell

| Element | Contents |
|---------|----------|
| Top bar (glass, sticky) | `dx` mark + **defxn** · network chip (`● Flux mesh · mainnet · 412 peers`) · theme toggle · identity chip (`KESTREL-7`, `◆ key in this browser`) linking to Account |
| Sidebar | four groups, icons + labels, active item = raised fill + `--primary` rule; legend explaining `◇`; Reset demo data |
| Page header | mono-caps breadcrumb · display title · one-paragraph purpose in plain words · optional right-aligned status chip or action |
| Toasts | bottom right: `Signed ‹action›` + summary + claim ID (`--trust` rule), `Nothing signed` (neutral), `Not signed · ‹code›` (`--danger`) |

---

## 3. Signing entry points (the matrix, built)

`ACTIONS` in `prototype/defxn/app.js` is the IA matrix as data. One row per
place in the product that signs, each filling every dialog field. `sign()`
is the only function that calls the dialog.

| Entry point | Route | Action | Scope | Authority (role) |
|-------------|-------|--------|-------|------------------|
| Send FXN / Credits | `#/account` | `transfer` | `fxn.account.transfers` | Flux DAO (member) |
| Send from treasury | `#/treasury` | `transfer` | `fxn.treasury.transfers` | Flux DAO (`treasury.operator`) |
| New deposit | `#/deposits` | `transfer` | `fxn.deposits` | Flux DAO (member) |
| Withdraw deposit | `#/deposits` | `transfer` | `fxn.deposits.withdrawals` | Flux DAO (member) |
| Publish page | `#/content/<slug>` | `publish` | `defxn.site.content` | defxn Editorial (`editorial.publisher`) |
| Deploy staged build | `#/deploy` | `publish` | `defxn.site.deploy` | defxn Editorial (`site.deployer`) |
| Roll back to build | `#/deploy` | `publish` | `defxn.site.deploy` | defxn Editorial (`site.deployer`) |
| Publish / update directory entry | `#/account/directory` | `founding.directory.publish` | `founding.directory` | Flux DAO · Founding (member) |
| Remove directory entry | `#/account/directory` | `founding.directory.unpublish` | `founding.directory` | Flux DAO · Founding (member) |

The **Requester** field is always `defxn ‹page›` with the exact route as
origin (e.g. `defxn #/content/about`), so the user can match it to where
they clicked. The **claim stack** is root identity → DAO membership → the
role the action needs → this request.

Manifests carry the real content being authorized: transfer amount (6
decimals), recipient DID and memo; page route, title, `bodySha256` and byte
length; build ID, replaced build and changed files; directory profile and
device keys.

---

## 4. Pages

### Overview `#/`
Four stat tiles (your FXN, your Credits, DAO treasury with today's cap bar,
directory status), then **Waiting on you** (linked rows with a status chip)
beside **Recently signed** (last five claims: summary, verb chip, scope, age).
It answers "is anything waiting on my signature?" in one glance.

### Account `#/account`
Left: balances, **Send FXN or Credits** form (recipient by callsign + DID,
amount + asset, public memo, sign note), "Sent from your account" table.
Right: **Identity** (callsign, DID, *root key is in this browser's handle;
defxn's servers never receive it*, device keys), **Your authority** (chain
of signed claims, same diamonds as the dialog), **Mesh directory** status card.

### Directory `#/account/directory` (new: the identity-to-mesh flow's home)
Left: entry editor (display name, one-line bio, links), a fixed note that
callsign, DID and device keys are always published so peers can check
signatures, sign note, **Review and sign publish** (or **update** +
**Remove listing** once listed). Right: **What peers will see**, the
directory card rendered exactly as peers get it, updating as you type, with
"This is the whole entry". Once listed: **Current listing** with claim ID and
signed time.

### Treasury `#/treasury`
Tiles: FXN, Credits, **today's cap** (remaining, bar, reset time). Send form
validates against both balance and remaining cap ("That's more than today's
remaining cap of 3,050 FXN"). **Policy** card states configuration pointer,
your role, cap, other operators, visibility. **Ledger** lists every transfer
with memo, signer and claim.

### Deposits `#/deposits`
Tiles: in the pool, Credits issued, available to deposit. Deposits table
with per-row **◇ Withdraw**. **New deposit** form shows the Credits you'll
receive live.

### Content `#/content` and editor `#/content/<slug>`
List: title, route, status (`Draft` / `Unpublished changes` / `Published`),
live revision. Editor: side-by-side edit and **Preview, what visitors will
see**; footer with sign note, **Save draft** (local, toast says nothing was
signed), **Discard changes** (when the live version differs), **Review and
sign publish**. Publish history lists revisions with claim IDs.

### Deploy `#/deploy`
**Live** (build, time, signer, size, digest, claim) beside **Staged** (build,
replaces, changed files with added/modified chips, **Review and sign
deploy**). **History** with **◇ Roll back to this** on superseded builds.
A rollback is a new signed deploy; history keeps both rows.

### Signed claims `#/activity`
Filter chips (All / Transfers / Publishes / Directory). Each row: verb
chip, summary, scope, age, short claim ID. Expands in place into the receipt
(claim, action, scope, signed at, origin route, manifest digest, signature).

---

## 5. States and feedback

| Situation | Treatment |
|-----------|-----------|
| Signed | Dialog shows receipt → Done → page updates (balance, row, status chip, badge) + `Signed ‹action›` toast with claim ID |
| User closes review | Nothing changes; neutral toast "Nothing signed · You closed the review. Nothing changed." |
| Review ends in expiry / error | Nothing changes; danger toast with the `SCA_*` code |
| Invalid form input | Inline error under the field (`role=alert`), focus returns to the field, dialog doesn't open |
| Empty lists | One plain sentence in the card ("Nothing sent yet.", "No build is staged. New builds appear here after CI finishes.") |

---

## 6. Responsive and themes

- **≥ 900 px:** sidebar + content, two-column splits.
- **< 900 px:** tab bar under the top bar; splits, editor and forms stack.
- **< 560 px:** network chip and identity subtitle hide; low-value table
  columns (`.hide-sm`: claim IDs, credits, signer) drop; the dialog becomes
  a full-screen sheet with stacked buttons and Sign on top.
- Theme follows the OS on first visit, then the toggle (saved per browser).
  The page uses the same token pairs as the dialog, which the contrast check
  covers in both themes. No horizontal scroll at 390 px (checked).

## 7. Tested

A Playwright pass in Chromium (1280 px and 390 px, dark and light) drives
all nine entry points through the real dialog: account transfer (including
over-balance validation), treasury transfer, deposit, withdraw, content
publish, deploy, rollback, directory publish, and a refused directory
removal (state unchanged). 12 claims recorded, no console errors, no
horizontal overflow. Screenshots are in `docs/screens/defxn/`.
