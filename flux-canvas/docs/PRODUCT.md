# Flux Canvas — what we are building

## In one sentence

**Flux Canvas is a real-time canvas where teams think, plan and deliver work together, peer to peer, and where every contribution is signed, so who did what, and who approved what, is provable without trusting any company's server.**

Short versions for different audiences:

- **For a pitch:** "FigJam where every sticky note is a signed transaction."
- **For engineers:** "Git for a whiteboard: every change is a signed, content-addressed record, the board is the union of everyone's records, and peers sync directly."
- **For a client or a DAO:** "You can see who contributed what, and the people who had to approve the work signed this exact version. Here's the proof file."

## The problem

Teams brainstorm, plan, give feedback and sign off work on whiteboards and docs. Today those tools are web2:

- **The vendor owns the data.** Your board lives on their server, behind their account system and their pricing.
- **History is editable and attribution is soft.** Anyone with access can change things, and "who wrote this" is a label the server shows you, not a fact you can check.
- **Approvals happen elsewhere.** A "looks good" lands in Slack or email and never connects to the exact version that was approved.
- **Delivery has no receipt.** When a client, a DAO or a manager says "approved", there is no artifact that proves which version, by whom, and when.

Web3 tools solved ownership and proof for money and assets, but not for the everyday work of making things together.

## The idea

Make the collaboration itself verifiable, without making it harder to use.

1. **Your identity is a key, not an account.** It's created on your device the first time you open the canvas. You give yourself a name; the key is what proves it's you. No sign-up, no server account.
2. **Every action is a signed record.** A sticky note, a stroke, a move, a comment, a vote, a task update, an approval: each is a small signed pattern, addressed by the hash of its content. Nothing is ever silently edited. Changes are new records that point to what they change.
3. **The canvas is the union of everyone's records.** There is no master copy. Two people who hold the same records see the same canvas. A short state root (a hash of all record IDs) shows it at a glance: "In sync with Ben · state HJBC7Q".
4. **People connect directly.** Tabs in the same browser sync on their own. Two people anywhere connect peer to peer by swapping two short codes (WebRTC, no server). A relay is optional: it keeps a canvas available when people aren't online at the same time, and it can't forge or change anything because everyone verifies every record.
5. **Work ends in a provable delivery.** Notes become tasks with owners, statuses and due dates. When the work is ready, someone delivers it and names the approvers (a quorum, like a multisig). Each approver signs that exact version of the canvas. The result is a proof: the version hash, the contributors and what each added, and the signed approvals that anyone can verify.

## The loop it supports

**Ideate → Organize → Decide → Deliver → Prove**

| Step | What people do | What makes it different |
|---|---|---|
| Ideate | Sticky notes, drawings, shapes, mind maps, moodboards, live cursors | Every idea carries its author, provably |
| Organize | Frames, connectors with meaning ("supports", "depends on"), outline view | The structure is readable by screen readers too |
| Decide | Dot votes, reactions, comments, audit walks with pass, fail and needs-info verdicts | Votes and verdicts are signed: no ballot stuffing, no "who said that?" |
| Deliver | Tasks with owners and due dates, progress, a delivery sent for approval | Approvers sign the exact version, and later edits can't sneak in |
| Prove | A proof file plus the canvas file | Anyone can check every signature offline, years later |

## Who it's for

- **Distributed teams and agencies** that need client sign-off tied to the exact version.
- **DAOs and open communities** that need to show who contributed what (for credit, bounties or governance) and to approve proposals by quorum.
- **Regulated or audited work** (finance, compliance, research) that needs a tamper-evident trail of decisions: the audit-flow feature is built for this.
- **Anyone who wants their work to stay theirs.** The whole app is one HTML file that runs offline, and the data is portable text.

## What makes it different

| | Typical whiteboard (Miro, FigJam) | Flux Canvas |
|---|---|---|
| Where the data lives | The vendor's server | Every participant's device; optional relay |
| Identity | Email account | A key you hold |
| Who did what | What the server says | A signature anyone can verify |
| History | Can be rewritten by admins | Append-only; deleting is a new signed record |
| Approval | A comment or a message | Signed by named approvers on an exact version, with a quorum |
| Works offline / without the company | No | Yes: one file, peer-to-peer sync, portable export |
| Lock-in | High | None: open record format, plain-text export |

## Is it "blockchain"?

Be precise with the team and with customers.

- **What it has:**
  - signatures (Ed25519) on every action;
  - content addressing (each record's ID is the hash of its bytes);
  - tamper evidence (a changed record no longer verifies);
  - no central owner;
  - append-only history;
  - multi-party approval by quorum;
  - a state root that summarises the whole canvas.
- **What it does not have (today):** a global chain, consensus among strangers, tokens or gas.
  - It doesn't need them: teammates aren't strangers competing to write the same ledger. They're collaborators who need proof of who did what.
- **The natural next step:** anchor a delivery's state root on a public chain. One transaction then timestamps the whole delivery for anyone to see, without putting the work itself on-chain.

The honest way to say it: **"Blockchain-grade proof for collaborative work, without the chain overhead. Anchoring to a public chain is a bolt-on."**

## What exists today

- **Canvas:** sticky notes, shapes (drag to size; fill; text size), drawing, text, images, connectors with meaning, frames, mind maps, flowcharts, wireframes; eight-handle resize, marquee selection, alignment, layers, grouping, undo across reloads.
- **Collaboration:**
  - names;
  - live cursors, what each person has selected or is editing;
  - follow someone, or bring everyone to your view;
  - comments with threads, votes, reactions, a shared timer, presentation mode.
- **Sync:** other tabs, direct peer-to-peer (two codes), or a relay (`npm run relay`, no dependencies); self-healing sync by state root; "caught up: 12 changes from Ana" after being away.
- **Work and proof:**
  - tasks (status, owner, due date) with a Work panel;
  - deliveries approved by quorum on an exact version, with a proof file;
  - audit flows with signed verdicts and sign-off;
  - a readable activity feed;
  - owner-controlled permissions.
- **Under the hood:**
  - non-extractable keys;
  - an append-only local log (IndexedDB);
  - verification in every browser;
  - clock-abuse protection;
  - compaction;
  - 59 modules in enforced layers;
  - 24 browser test suites.

## What's next (and what to be careful not to over-promise)

| Next | Why it matters |
|---|---|
| Passkeys as the identity root | Keys can't be backed up today; clearing the browser loses that identity (the work stays valid) |
| End-to-end encryption on the relay | The relay can read what it forwards today |
| On-chain anchoring of deliveries | Public timestamp of a delivery's state root |
| Rotation, text styling inside shapes, components | Closer to a full design tool |
| Profiles with verified links (e.g. a wallet or a domain) | Tie a key to a public identity people already know |

## Words we use

| Word | Meaning |
|---|---|
| Record | One signed action: `ACTION-KEY-value…-SIG-signature` |
| CID | A record's ID: the hash of its bytes |
| Canvas | The union of all records with its canvas ID |
| State root | A hash of every record ID: equal roots mean the same canvas |
| Owner | The key the canvas ID was derived from; sets permissions |
| Delivery | A request for named people to approve the canvas as it was at that moment |
| Proof | The delivery, its signed approvals, the contributors, and the version hash |
