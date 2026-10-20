# Flux Canvas — team features

Twenty-one features that turn the canvas from a whiteboard that proves things into a **coordination substrate**: people decide, meet, deliver, get paid and remember together, and every step is a signed record anyone can check.

They come from three lists:
- seven **FLX-native** features: what the record can prove;
- seven **collaboration-native** features: how people actually work together;
- seven of our own that complete the loop.

Where two ideas overlapped, they were split into one primitive plus the feature built on it, so each does one thing well. The pairs are listed under "Overlaps, isolated".

Every feature is **one module** in `js/features/`. It registers itself (`registerFeature`), its record types (`registerRecord`), its panel (`registerPanel`) and its hooks. It touches no other feature's code. Open them all from the **Team** button (the four squares, top right), or with ⌘K.

## Where you find them

| Place | What is there |
|---|---|
| **Team button** (four squares, top right; ⇧T; ⌘K) | Every feature as a tile, grouped by what you're doing, with live status on a second line. **Needs you** at the top lists what waits on you (approvals, payments to release, suggestions in your zones, reviews due, claims to check, stances to take, link and recovery requests, a ritual or agenda item whose time is up); the number on the button counts them |
| **Live button** | Who is here and how to invite, plus *Run this session* (silent round, facilitated meeting, rituals, room, zones) and *Network and identity* (mesh, canvas graph, devices and recovery) |
| **Selection toolbar** | Stance (scales; its menu also starts a blind round), task (✓, K); under More: mark as a claim, record a decision, and zone on a frame you own |
| **Work panel** | Deliver this work: one dialog for what, who approves (or an approval flow) and the payment terms, which approvers see before they sign. Each delivery card has one labelled line per part (approvals, flow, shares, payment, witnesses) and an excerpt button. A *Next up* card above the tasks shows what can start now and the critical path as a chain |
| **Session bar** (under the title) | A silent round's prompt and time, the agenda item and its time box with the queue for the floor, a ritual's outputs; each with its buttons |
| **On the canvas** | Stance counts, "Decided", claim states, tasks blocked and the critical path, zone owners and suggestions to accept, where attention gathers, sealed cards, replay's marker, what changed |
| **Data button** (grid, in the dock; D) | Tables, checklists, metrics, charts, formulas, dates, links and code: data anyone can change one signed value at a time ([DATA.md](DATA.md)) |
| **Flows** (Data → Flow, Step; Team → Flows) | Chain notes, data and steps and run them; responses are signed, AI connects as a responder ([FLOWS.md](FLOWS.md)) |
| **Canvas home** | Retro, sprint planning, design review and kickoff with their contract running |
| **Help (?)** | *Working as a team* explains all of this |

`tests/teamui.mjs` clicks through every one of these as a person would.

## At a glance

| # | Feature | Group | Records | Module | Origin |
|---|---|---|---|---|---|
| 1 | Claim grounding | Decide | `CLAIM` `EVIDENCE` `CHECK` | claims.js | FLX |
| 2 | Canvas-to-Cash | Deliver | `FUND` `PAY` `SETTLE` | payouts.js | FLX |
| 3 | Contribution proof | Deliver | `METHOD` `CREDIT` | contribution.js | FLX |
| 4 | Lineage forks | Remember | `INHERIT` `LINEAGE` `FORKED` | lineage.js | FLX |
| 5 | Sealed bids and commitments | Decide | `SEAL` `REVEAL` | seal.js | FLX |
| 6 | Approval flows | Deliver | `FLOW` | flows.js | FLX |
| 7 | Canvas graph | Network | `RESULT` | graph.js | FLX |
| 8 | Replay | Remember | (none: derived) | replay.js | Collab |
| 9 | Room: structural presence | Meet | (none: live only) | attention.js | Collab |
| 10 | Silent rounds | Meet | `ROUND` (+ `SEAL`) | rounds.js | Collab |
| 11 | Facilitated meeting | Meet | `FACIL` `AGENDA` `NEXT` `HAND` `FLOOR` `SCRIBE` | facilitate.js | Collab |
| 12 | Decision ledger | Decide | `DECISION` `REVIEW` | decisions.js | Collab |
| 13 | Consensus map | Decide | `STANCE` | stances.js | Collab |
| 14 | Ritual contracts | Meet | `RITUAL` `CLOSE` | rituals.js | Collab |
| 15 | What changed | Remember | (none: derived) | since.js | Ours |
| 16 | Peer witnesses | Deliver | `WITNESS` | witness.js | Ours |
| 17 | Devices and recovery | Network | `LINK` `GUARD` `RECOVER` | devices.js | Ours |
| 18 | Zones and suggestions | Meet | `ZONE` `ACCEPT` | zones.js | Ours |
| 19 | Dependencies and critical path | Deliver | (none: from `TASK` + `ARROW`) | taskflow.js | Ours |
| 20 | Mesh relay | Network | (none: transport) | mesh.js | Ours |
| 21 | Excerpts with proof | Deliver | (none: a file) | excerpt.js | Ours |

## Decide

### 1. Claim grounding
- **Problem:** "Competitor X raised $50M" becomes a fact by repetition. Nobody checks it.
- **What it does:** mark a note as a claim, then attach evidence for or against it. Evidence is another item on the canvas, or a source link with the quote. People other than the claim's author check it.
- **On the canvas:** every claim shows its state: grounded (with a score), evidence unchecked, asserted (no evidence), or contradicted.
- **Score:** independent checks that hold ÷ all independent checks. The author's own check never counts.
- **Match hint:** shows which numbers and names in the claim appear in its evidence. It is a hint, not a verdict.
- **Deliveries:** an approval flow can require "every claim grounded". The proof lists each claim's state *at the moment of delivery*, so it records what was believed and why.
- **Automatic grounding:** a resolver or a model can plug in through `GROUNDERS`. It signs its checks with its own key and counts like any other reviewer.
- **Limit:** no grounder ships in the file. Without one, grounding is human review, and the panel says so.

### 5. Sealed bids and commitments
- **What it does:** seals a record now so nobody can read or change it until a set time.
- **How:**
  - The record is encrypted (AES-GCM).
  - The seal commits to the record's CID, so after the reveal everyone checks the plaintext is exactly what was sealed.
  - Only the sealer can reveal it. Clients open a reveal only once its time has come.
- **Uses:** sealed-bid procurement, blind votes, and pre-commitments ("if X by Q4, we ship Y"). Reveal proves it wasn't decided afterwards.
- **Limit:** without a time-lock service, a sealer who goes offline can't be forced to reveal. The panel shows who still owes a reveal. Scoped reveal to particular people needs encryption keys per person (a next step).

### 12. Decision ledger
- **What it does:** a decision distils a discussion into a signed `DECISION`. It carries:
  - the text;
  - the notes it rests on (its evidence);
  - whether it can be reversed;
  - a review date.
- **The ledger:** lists decisions with the stances on them. It flags any decision made over 30% or more disagreement, and brings decisions back when their review date comes.
- **Reviews:** a `REVIEW` keeps or reverses a decision.
- **Exports:** a decision log in Markdown. The canvas graph finds decisions across canvases.

### 13. Consensus map
- **What it does:** on any item or decision, each person signs a stance: agree, disagree, unsure, have an alternative, or abstain. Their latest stance counts.
- **Levels per item:**
  - *split*: 30% or more disagree;
  - *uncertain*: 40% or more unsure or proposing an alternative;
  - *converged*: 70% or more agree;
  - *mixed*: anything else.
- **Convergence:** measured over time, for example "disagreement 50% → 0%".
- **On the canvas:** the map tints every item, and the panel lists who hasn't said where they stand.
- **Votes are separate:** votes (brainstorm) say what matters; stances say whether we agree.

## Meet

### 9. Room: structural presence
- **What it shows:** not just cursors, but what each person is doing:
  - editing an item, and for how long;
  - reading the same note for 10 seconds or more;
  - idle;
  - *maybe stuck*: on one item for 90 seconds or more without adding anything;
  - *looked at a decision without taking a stance*.
- **On the canvas:** items several people are on get an "N here" badge.
- **Privacy:** attention travels with live presence and is **never signed or stored**. A permanent log of where everyone looked would bloat the record and turn presence into surveillance. Anyone can stop sharing it.

### 10. Silent rounds
- **What it does:** brainwriting enforced by the tool. While a round runs, every note you add is **sealed** (feature 5). Nobody can read anyone's ideas, not even the round's starter, and others don't even see where you put them.
- **At the end:** everything opens together. The strip shows the prompt, the time left, how many ideas are sealed, and afterwards who still owes a reveal.
- **Blind stance rounds:** the same for stances on one item.

### 11. Facilitated meeting
- **The role:** a facilitator is a signed, transferable role. The owner appoints one, or the current facilitator hands over.
- **The agenda:** items with time boxes. A new item pulls everyone's view to its frame (anyone can opt out). When time is up the canvas dims briefly.
- **The floor:** a raise-hand queue ordered by when hands went up. The facilitator gives the floor, and names a note-taker per item.
- **The record:** planned against actual time, who spoke, and minutes built from the signed records made during each item (decisions, action items, notes).

### 14. Ritual contracts
- **What it does:** a retro, planning session, design review or kickoff starts as a contract. The contract names:
  - the outputs it must produce (decisions, action items, stances, notes…);
  - how many people must take part;
  - its time box.
- **Closing:** a ritual closes as a success only if the outputs exist. A "success" signed without them counts as incomplete. When time runs out, it closes as incomplete for everyone to see.
- **The record:** the team's history is a fact, for example "1 of 2 closed as a success". Approval flows can require the latest ritual to have succeeded.

### 18. Zones and suggestions
- **Who:** the owner of a frame (its author, or the canvas owner) makes it a zone.
- **The area:** always the frame itself, wherever it has moved. The canvas owner is never gated, and where zones overlap every owner must accept.
- **Suggest zone:** others' additions, moves and edits inside it are held as suggestions, drawn ghosted with the suggester's name, until the owner accepts or declines.
- **Locked zone:** others' changes there don't count, and their client says so before signing.
- **Never gated:** comments, stances, claims and tasks. Discussion stays open.

## Deliver

### 2. Canvas-to-Cash
- **Pool:** backers sign pledges (`FUND`) to a canvas's pool.
- **Terms:** a delivery carries terms (`PAY`): an amount and unit, split evenly, by contribution, or by fixed shares.
- **Approvals cover the terms:** each approval names the payment terms it was signed with. Terms changed afterwards must be approved again before anything can be released.
- **Settlement:** when the delivery's approvals are complete, its author signs a `SETTLE` with the payout lines.
- **The pool pays** only settlements that the canvas owner or a backer approved.
  - Every peer recomputes the lines from the terms, so a settlement that pays the wrong people doesn't count.
  - Template royalties (feature 4) are paid first.
- **Executing it:** payment connectors (`PAYOUT_CONNECTORS`: an FXN service-pool resolver, a payment API, a chain) execute it. Without one, Flux gives a payout manifest with the settlement, lines and approvals.
- **Limit:** no money moves inside the file. Flux produces the instruction and its proof; a connector moves the money.

### 3. Contribution proof
- **Shares:** who did how much, derived from the signed records. Work is weighted by kind: created, refined, arranged, commented, stanced, voted, grounded, decided, finished tasks owned, facilitated, approved.
- **The method:** a signed record (`METHOD`). Anyone can propose another, and the room takes stances on it. On an owned canvas the owner's method applies; on an open one, the method most people agree with.
- **Credit:** for each delivery, its author signs a `CREDIT`, which every peer recomputes. Payouts can split by it, and the canvas graph sums it across canvases as each person's record of work.

### 6. Approval flows
- **What it is:** a signed rule (`FLOW`) that sets what a delivery must meet:
  - groups with thresholds (Engineering 2 of 3, Legal 1 of 1);
  - an optional order (Legal's signature counts only once Engineering is complete);
  - conditions on the canvas itself;
  - an escalation flow that applies after a set number of hours.
- **Conditions:** come from any feature through `FLOW_CONDITIONS`:
  - every claim grounded;
  - every task done;
  - no split item;
  - no decision due for review;
  - the latest ritual succeeded;
  - an audit signed off;
  - nothing open on the critical path.
- **Evaluation:** every peer evaluates the flow the same way. The Work panel shows each group and condition, and the proof records who signed in what order.

### 16. Peer witnesses
- **What it does:** anyone countersigns "I hold exactly this version, now". Several independent witnesses date a version without a chain: to deny it existed, every witness would have had to lie.
- **Checking:** each peer recomputes the version from its own records and checks every witness. Only checked witnesses count, one per person, and you can witness a delivery only once your browser holds its exact version.
- **Deliveries:** witnesses show on deliveries and in the proof. Optionally, witness every delivery that completes while you're there.

### 19. Dependencies and critical path
- **Ordering tasks:** connect two tasks. "depends on" points at what must finish first; "leads to" or a plain arrow points at what comes next.
- **What you see:**
  - blocked tasks say what they wait on;
  - the Work panel lists what is ready now;
  - the critical path (the longest chain of unfinished work) is outlined;
  - loops are flagged.
- **Records:** nothing new is signed. It reads tasks and connectors.

### 21. Excerpts with proof
- **What it does:** share one frame or a few notes from an approved delivery, with the proof that they belong to the approved version.
- **The file carries:**
  - the records;
  - the delivery and its approvals;
  - the IDs (hashes only) of every record in the version.
- **The recipient:** checks every signature, recomputes the version root from the IDs, and confirms each record is in it. Nothing outside the excerpt is revealed but its hash. A verified excerpt opens as its own canvas.

## Remember

### 4. Lineage forks
- **Forking:** copies a canvas's work **as the original signed records**, so every author keeps their signature and credit, and starts a canvas you own.
- **Links both ways:** `LINEAGE` in the fork names its parent and the version it started from. `FORKED` in the parent lists descendants, and people can endorse them.
- **Royalties:** the parent's owner can set terms (`INHERIT`): open or closed to forks, and a royalty on payouts. The terms and the parent's ownership proof travel into the fork, so a royalty counts only if the parent's real owner signed it, and nobody can drop or redirect it.
- **Pulling updates:** forks can pull later changes from their parent.
- **Not copied:** governance (ownership, grants, deliveries, payments, meetings). A fork inherits the work and the reasoning, not the authority.

### 8. Replay
- **What it does:** the canvas plays back how it was made, in its real rhythm, compressed (each session in 30 seconds, 4×, 16×, 60×, or one step a second).
- **What you see:** a marker in the author's colour shows who did each step and what they did.
- **Scope:** replay everything, only decisions, approvals and stances, one person, or the last hour.
- **Jumping:** go to work sessions (runs without a 20-minute gap) and to the moments decisions, approvals, reveals and settlements happened.
- **Read-only:** nothing can be signed while it runs. Nothing is recorded to make this possible: the records *are* the recording.

### 15. What changed
- **What it does:** catch up in place. Choose a moment:
  - since your last visit;
  - the last hour or day;
  - a delivery;
  - a decision.
- **What you see:** the canvas outlines what was added, edited, moved, removed or discussed, with who did it. The panel steps through the changes one by one.
- **Replay plays; this reviews.**

## Network and identity

### 7. Canvas graph
- **What it does:** asks questions across every canvas this device holds, either by kind, person, text and time, grouped by person, canvas, kind or day, or with presets:
  - decisions everywhere;
  - who approves most;
  - each person's record of work (signed records, canvases, credited deliveries, average share);
  - how rituals close;
  - the most forked canvases;
  - claims and their checks.
- **Signed results:** a result can be signed (`RESULT`), and anyone holding the same canvases can recompute it.
- **Limit:** there is no central index. The graph is what you hold, and what peers have synced to you.

### 17. Devices and recovery
- **Linking:** one person, several keys. Two devices that link to each other (a code, then a confirmation) become one person. Their names, approvals, credit and grants count together.
- **Per canvas:** links, guardians and recoveries name the canvas they apply to, so they can't be replayed into another.
- **Guardians:** name guardians and a threshold. If you lose a device, a new key asks to be you; once enough guardians confirm (from any of their devices), it is.
- **Keys:** stay non-extractable; nothing secret moves between devices.
- **Answers the old gap:** this answers "clearing the browser loses your identity".

### 20. Mesh relay
- **What it does:** every browser passes on what it hears. A record that is new here goes to every other connection except the one it came from. Presence and room signals go on with a hop count, up to 3.
- **Result:** people connected in a line or a star all see each other live, with no server.
- **Safety:** forwarding can't forge anything, because records are verified by everyone who receives them. A known record is never sent again, so messages stop.

## How it is modular

```
core/hooks.js     registerRecord · registerFeature · DERIVE / RENDER / CHANGE / SYNC / PRESENCE hooks
                  DELIVERY_HOOKS { evaluate, proof, row, choices } · FLOW_CONDITIONS · RECORD_GATES
                  PUBLISH_FILTERS · WIRE_INGEST_HOOKS · IDENTITY (key → person)
ui/panels.js      registerPanel: one side panel at a time, repaint keeping focus and typed text; canvas badges
ui/form.js        formDialog: a labelled multi-field dialog (no <form>, works in sandboxes)
ui/hub.js         the Team button (FEATURES grouped, with live status) and the session strip (STRIP)
features/*.js     one file per feature; each declares its records, its panel and its hooks
```

- **Each feature extends the others only through hooks, never by editing them:**
  - Flows judge deliveries through `DELIVERY_HOOKS.evaluate`.
  - Payouts, contribution, witnesses and excerpts add rows and proof sections.
  - Claims, stances, decisions, rituals, tasks and the critical path offer conditions to flows (`FLOW_CONDITIONS`).
  - Rounds seal notes through `PUBLISH_FILTERS`. Zones gate records through `RECORD_GATES`.
  - Linked devices change who a key belongs to through `IDENTITY`.
  - The mesh forwards through `WIRE_INGEST_HOOKS`.
- **Layers:** `tools/deps.mjs` enforces the layers and the absence of duplicate names: 83 modules, checked in `npm run check`.
- **Reserved field:** `N` means revoke or restore on every record, so no feature uses it for anything else.

## Overlaps, isolated

| Overlap | How it was split | Why it's stronger |
|---|---|---|
| Sealed records and silent rounds | `seal.js` is the primitive (commit, encrypt, reveal); `rounds.js` is the ritual on top (prompt, time, who, all reveal together) | Sealing also serves bids, blind votes and pre-commitments; rounds stay simple |
| Votes and stances | Votes say what matters (budgeted); stances say whether we agree (one per person, five kinds) | Prioritising and agreeing are different questions; mixing them hides disagreement |
| Decisions and claims | Claims are about facts (evidence, checks); decisions are about choices (evidence, stances, reviews) | A decision can rest on claims; flows can require both grounded and unsplit |
| Approvals and flows | A delivery's quorum stays the simple case; a flow is an optional signed rule | Simple deliveries stay one click; complex governance is a record, not code |
| Payouts, contribution and royalties | Contribution computes shares; payouts apply terms; lineage adds royalties through `SETTLE_HOOKS` | Each is checkable alone; together a fork's payout pays the template author, then the contributors |
| Approvals and witnesses | Approvers accept the work; witnesses only attest it existed | Outsiders (a client, an auditor) date a version without approving it |
| Replay, what changed, and Activity | Replay plays the session; What changed reviews the result in place; Activity is the stream | Three ways to catch up, for three situations |
| Facilitation and rituals | Facilitation runs a meeting (agenda, floor, time); a ritual is its contract (required outputs) | A ritual can run without a facilitator, and a meeting without a contract |
| Presence and attention | Presence carries cursors and selection; attention adds what people are doing, live only | Attention never becomes a permanent record |
| Relay and mesh | The relay stores for people who aren't online together; the mesh forwards among those who are | Groups work with no server; the relay stays optional |

## How they multiply

| Combination | What it gives |
|---|---|
| Replay + claim grounding | Replay only the decisions and checks: see when a claim was verified and what was decided on it |
| Room + contribution | The room shows who is on what now; contribution shows who did what, from records |
| Silent rounds + sealed records | Brainwriting nobody can peek at, then a blind stance round on the best idea |
| Facilitation + approval flows | Run the delivery's approval inside a facilitated meeting; the minutes list it |
| Decision ledger + canvas graph | Every decision across canvases, with its stances and reviews |
| Consensus + lineage | Endorse the forks you agree with; the parent shows its most endorsed descendants |
| Rituals + Canvas-to-Cash | A retro that must produce action items; a delivery whose flow requires that retro, paid by contribution |
| Flows + claims + critical path | "Ship only when every claim is grounded and nothing on the critical path is open" |
| Zones + suggest mode + witnesses | An owner curates their area; a client witnesses the final version |
| Devices + approvals | Approve from your phone; it counts as you. Lose it; your guardians restore you |

## Tests

| Suite | Checks | Covers |
|---|---|---|
| `tests/reason.mjs` | 22 | Stances and convergence, decision ledger and reviews, claim grounding end to end, the Team hub |
| `tests/meeting.mjs` | 28 | Sealed bids, silent and blind-stance rounds, facilitation and handover, ritual contracts, structural presence (three people) |
| `tests/economy.mjs` | 25 | Mesh sync, ordered approval flows with conditions, contribution and methods, payouts and pool, witnesses, excerpts and tampering (three people) |
| `tests/memory.mjs` | 29 | Zones, dependencies, linked devices and guardian recovery, what changed, replay, lineage with royalties, the canvas graph (four people) |

| `tests/teamui.mjs` | 39 | Every Team hub item opens by clicking; Deliver with payment terms; approving and releasing from “Needs you”; the stance button and blind round; the live panel's shortcuts; ritual templates; help and ⇧T |
| `tests/attacks.mjs` | 17 | The attacks from the round-4 audit, replayed: zone blanking, flow conditions, backdated versions, forged credits and settlements, round hijacking, seal length, facilitation rerouting, decision and claim tampering, malformed records, markup in presence ids |

Every suite runs people in separate browser contexts connected peer to peer, and scans each feature panel with axe. The rules each feature enforces against a malicious peer are listed in [AUDIT.md](AUDIT.md), round 4.

## Words, mapped from the FLX briefs

| In the brief | In Flux Canvas |
|---|---|
| `Y-CLAIM -G-<key>` … `-S-<sig>` | `CLAIM-I-<key>-…-SIG-<sig>`: the same idea in the canvas grammar (`ACTION-KEY-value…-SIG`) |
| Resolver | Every peer. Each browser evaluates flows, credits and settlements itself, so there is nothing to trust in the middle. An external resolver plugs in as a grounder or a payout connector |
| Ghost | A person: one or more linked keys (feature 17) |
| FXN, service pool | A pool's unit and the payout connector that executes settlements |
| Grounding Gate | Claims with independent checks; an automatic grounder can sign checks too |
