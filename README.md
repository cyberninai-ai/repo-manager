# SHARD — sovereign code mesh

> GitHub, redesigned without the hub. Every repo is a signed, content-addressed
> shard replicated peer-to-peer. No central server owns your code, your
> identity, your issues, or your history.

```
 ┌──────────┐   QUIC/Noise   ┌──────────┐   gossip    ┌──────────┐
 │  you     │◀──────────────▶│  teammate│◀───────────▶│  seed    │
 │  (node)  │   git packs    │  (node)  │  ref annc.  │  (node)  │
 └──────────┘                └──────────┘             └──────────┘
        ▲                         DHT: repo-id → who seeds it
        └──────────────────────────────────────────────────────┘
```

## What it is

- **Git underneath.** Repos are plain Git. `git push shard main` works.
  SHARD adds identity, signatures, replication and collaboration on top.
- **Self-sovereign identity.** You are an Ed25519 key, not an account row.
  Each device has its own key, certified by your root identity.
- **Real P2P.** libp2p transport (QUIC + Noise), Kademlia DHT for discovery,
  GossipSub for ref announcements, hole punching + relays for NAT.
- **Collaboration as data.** Issues, patches (PRs), reviews and releases are
  CRDT op-logs stored *inside the repo* as Git objects, so they replicate
  with the code and work offline.
- **Merges by quorum.** The canonical branch is whatever a threshold of
  repo delegates have signed. No admin panel can rewrite it.
- **Auditable history and safe rollback.** Every canonical ref move is a
  signed entry in a hash-chained ledger. A rollback is a new ledger entry,
  not deleted history, so it can always be undone.
- **Private by construction.** Private repos replicate only to authorized
  peers, and are end-to-end encrypted (MLS group keys) when stored on
  untrusted "blind" seeds.
- **Teams without a landlord.** Orgs are signed membership documents with
  roles and M-of-N policy thresholds.

## Contents

| Path | What |
|------|------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design: identity, network, storage, merges, privacy, teams |
| [`docs/FLOWS.md`](docs/FLOWS.md) | Step-by-step user flows (CLI + UI): clone, commit, patch, review, merge, rollback, team, privacy |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Ref layout, identity documents, collaborative object schemas, ledger format |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | The cyber visual language: color tokens, type, components, motion |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Phased delivery plan and open questions |
| [`prototype/index.html`](prototype/index.html) | Clickable UI prototype (no build step: open in a browser) |

## Remote Env product design (prototype)

`prototype/index.html` is the **UI design** for Remote Env's developer and
tester product surfaces. The engineering team builds the product; this file
shows what people see and how each flow feels. Layout and patterns follow
GitHub (project header with tabs, Releases-style versions, Issues-style
feedback, audit log, settings sidebar) so the product feels familiar from
the first visit.

**Developer view**
- **Home**: projects and "needs your attention".
- **Overview**: live environments, open feedback, README, about sidebar.
- **Modules**: version list per module; publish, deprecate, revoke.
- **Environments**: each version pins exact module versions; side-by-side
  diff against the previous version; "New version" composer.
- **Rollouts**: release, pause, resume, roll back (reason required), close
  (typed confirm), with a timeline.
- **Testers**: tester groups, invite flow, "is this person in the group?" check.
- **Feedback**: Issues-style list and detail. The tester's original report is
  locked, corrections are added instead of edits, and every report is tied to
  the exact version tested.
- **Activity**: permanent audit log with filters.
- **Settings**: people & access, encryption keys, close project.

**Tester view**: inbox (active, paused and revoked invites), "confirm it's you"
unlock steps, run screen with the exact version bar, report-an-issue form.

**Design system** (`#/design`): status labels, refusal message pattern
(What happened / What's needed / How to fix + error code), confirmation
rules, color roles, and a table mapping UI words to protocol terms for the
dev handoff.

Data and actions are mocked in the page. Light and dark themes are included.

```sh
xdg-open prototype/index.html    # or: open prototype/index.html
```

| Project overview | Rollouts |
|---|---|
| ![overview](docs/screens/overview.png) | ![rollouts](docs/screens/rollouts.png) |
| **Feedback** | **Tester run screen** |
| ![feedback](docs/screens/feedback-item.png) | ![tester](docs/screens/tester-run.png) |
| **Refusal message** | **Design system** |
| ![refusal](docs/screens/publish-refusal.png) | ![design](docs/screens/design.png) |
