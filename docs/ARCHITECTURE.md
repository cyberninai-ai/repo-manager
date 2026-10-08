# SHARD Architecture

Status: design draft v0.1

## 1. Goals and non-goals

**Goals**

1. No server is required for any core operation: clone, commit, review,
   merge, release, rollback, permission change.
2. Git stays the storage format and remains usable with stock `git`.
3. Every authoritative statement (who can merge, what `main` points to, who is
   on a team) is a signature, verifiable offline by anyone holding the repo.
4. Private repos stay private even when hosted on machines you do not trust.
5. A UI that matches GitHub-level ergonomics: it should feel faster, not
   like a protocol demo.

**Non-goals (v1)**

- Global consensus or a blockchain. There is no global state. Each repo is its
  own trust domain with its own delegates.
- Tokens or payments. Seeding incentives are social and organizational
  (orgs run their own seeds), not financial.
- Recalling data already replicated to a peer. You cannot un-send bytes; we
  design for detection and rotation instead (see §8.5).

## 2. Layered overview

```
┌───────────────────────────────────────────────────────────────┐
│ CLIENTS      Web UI (local)  ·  Desktop  ·  `shd` CLI  ·  git │
├───────────────────────────────────────────────────────────────┤
│ NODE API     JSON-RPC + event stream on localhost (authz'd)   │
├───────────────────────────────────────────────────────────────┤
│ COLLAB       Patches · Issues · Reviews · Releases · CI attest│
│              (CRDT op-logs as Git commit DAGs)                │
├───────────────────────────────────────────────────────────────┤
│ GOVERNANCE   Identity docs · Delegates · Quorum · Ref ledger  │
│              Org/team docs · Branch protection policies       │
├───────────────────────────────────────────────────────────────┤
│ STORAGE      Git object DB · per-peer namespaces · sigrefs    │
│              Encrypted bundles (private repos on blind seeds) │
├───────────────────────────────────────────────────────────────┤
│ REPLICATION  Fetch over git-protocol-v2 on libp2p streams     │
│              Gossip ref announcements · seeding policy        │
├───────────────────────────────────────────────────────────────┤
│ NETWORK      libp2p: QUIC/TCP · Noise XX · Kademlia DHT ·     │
│              GossipSub · AutoNAT · DCUtR hole punch · Relay v2│
│              optional: Tor onion transport                    │
├───────────────────────────────────────────────────────────────┤
│ IDENTITY     Root key · device keys · keychain · recovery     │
└───────────────────────────────────────────────────────────────┘
```

Every user runs a **node** (`shardd`). The UI is a local web app served by
the node, so there is no hosted frontend to trust. "Seeds" are just nodes
that are always on and replicate many repos.

## 3. Identity

### 3.1 Keys

| Key | Type | Lives | Purpose |
|-----|------|-------|---------|
| Root key | Ed25519 | Hardware key or offline, rarely used | Certifies device keys, signs identity doc updates |
| Device key | Ed25519 | OS keychain / secure enclave | Signs commits, refs, COB ops; libp2p PeerId |
| Persona | `did:key:z6Mk…` derived from root | Public | The stable "you" shown in the UI (`@handle` is a local petname) |

The **identity document** (`refs/shard/id` in your personal repo) lists your
current device keys, display name, avatar hash and revoked keys. It is a
Git commit chain where each update is signed by the root key (or by a quorum
of device keys if you configure `threshold: 2` for root-less mode).

### 3.2 Handles

There is no global namespace to squat. `@ada` is a petname: a mapping from a
name to a DID kept in your local address book, plus optionally:

- DNS proof: `_shard.example.com TXT "did=did:key:z6Mk…"` gives `ada@example.com`.
- Org-issued names: an org doc can name members (`ada@cyberninai`).

The UI always shows a short key fingerprint next to a handle the first time,
and warns when two personas share a display name.

### 3.3 Recovery

- Primary: root key on a hardware token, backup token in a drawer.
- Social recovery: root key split with Shamir (e.g. 3-of-5) across trusted
  peers, who can co-sign a "rotate root" statement. Peers never see the key.
- A rotation is published in the identity doc chain. Old signatures stay
  valid up to the rotation point; signatures by revoked keys after it are
  rejected.

## 4. Network

### 4.1 Transport

libp2p with QUIC (preferred) and TCP+Yamux fallback, Noise XX handshake.
The PeerId is the device key, so **transport authentication equals identity
authentication**. A private repo's access control is enforced at the stream
level: a node simply refuses to serve fetches to peers not on the list.

NAT traversal: AutoNAT to detect reachability, Circuit Relay v2 through
seeds, then DCUtR to upgrade to a direct hole-punched connection.

### 4.2 Discovery

| Question | Mechanism |
|----------|-----------|
| Who seeds repo X? | Kademlia DHT provider records keyed by repo ID (public repos) |
| Who seeds private repo X? | Blinded rendezvous key `HMAC(repo_secret, day)` so the DHT can't link announcements to a repo |
| What changed in repo X? | GossipSub topic `shard/repo/<id>` carries signed ref announcements |
| Is there a peer on my LAN? | mDNS |
| What repos exist? | Local index + opt-in indexer nodes that crawl public announcements |

### 4.3 Replication

1. Receive a ref announcement `{repo, peer, sigrefs_oid, sig}` over gossip.
2. Check seeding policy (do I track this repo? this peer?).
3. Open a stream to the announcer (or any seed) and run a **git protocol v2
   fetch** for the peer's namespace. Only missing objects travel.
4. Verify: the sigrefs blob must be signed by the peer's device key, and every
   ref in it must match what was fetched. Reject anything unsigned.
5. Recompute canonical refs (§6) and emit a local event to the UI.

Because objects are content-addressed, any peer can serve any object, and
corruption or tampering is detected by hash.

### 4.4 Seeding policy

A node decides per repo and per peer:

```toml
[policy]
default = "block"             # or "allow"
[[repo]]
id = "shd:z3vX…"
scope = "followed"            # replicate only namespaces of followed peers + delegates
[[peer]]
did = "did:key:z6Mk…"
action = "follow"
```

Seeds advertise their policy so users know where their repo will survive.
Orgs typically run 2–3 seeds; community seeds pick up popular public repos.

## 5. Storage layout

One Git repository per SHARD repo on each node, with per-peer namespaces:

```
refs/
  namespaces/<peer-did>/refs/heads/*        that peer's branches
  namespaces/<peer-did>/refs/tags/*
  namespaces/<peer-did>/refs/shard/sigrefs   signed list of all refs above
  shard/id                                   repo identity doc (delegates, policy)
  shard/ledger                               canonical ref ledger (§7)
  cobs/<type>/<id>                            collaborative objects (§9)
  heads/*  tags/*                            CANONICAL refs, computed locally
```

Nobody can write into another peer's namespace: each namespace is only
accepted when signed by its owner. Canonical `refs/heads/*` is never
received from the network; every node derives it locally from signatures.

Details are in [DATA_MODEL.md](DATA_MODEL.md).

## 6. Repo governance: delegates, quorum, canonical refs

The **repo identity doc** is created at `shd init`:

```yaml
id: shd:z3vXk9…               # hash of the genesis doc, never changes
name: repo-manager
visibility: private
delegates:                     # people or orgs allowed to move canonical refs
  - did:key:z6MkAda…
  - did:key:z6MkLin…
  - org:shd:zOrgCyber…#maintainers
threshold: 2                   # signatures needed to move a protected ref
default_branch: main
protect:
  main:
    require_reviews: 1
    require_attestations: [ "ci/test" ]
    require_signed_commits: true
    allow_force: false        # rollback goes through the ledger instead
```

Changing this doc (add a delegate, change threshold) itself requires
`threshold` delegate signatures. Its history is a signed commit chain, so any
node can replay it and check who had authority at any point in time.

**Canonical ref rule.** For a protected branch, canonical `main` = the most
recent ledger entry for `main` that carries ≥ `threshold` valid delegate
signatures and satisfies `protect.main`. For unprotected branches, the
canonical head is the newest head among delegates where all delegate heads
are ancestors (fast-forward agreement); if delegates diverge, the UI shows a
**split** state rather than silently picking one.

## 7. The ref ledger (history of record)

Git history shows what changed in the code. The ledger shows **who moved the
branch, when, why, and with whose approval**.

`refs/shard/ledger` is a hash-chained, append-only log (stored as Git commits):

```json
{
  "seq": 42,
  "prev": "b1e9…",
  "ref": "refs/heads/main",
  "from": "4f2a1c…",
  "to":   "9d77e0…",
  "kind": "merge",                 // merge | push | revert | rollback | tag | policy
  "patch": "cob:patch/7c1f…",
  "attestations": ["ci/test@9d77e0 by did:key:z6MkRunner…"],
  "reason": "Merge patch #12: peer sync over QUIC",
  "lamport": 913,
  "signatures": [ {"did": "did:key:z6MkAda…", "sig": "…"},
                  {"did": "did:key:z6MkLin…", "sig": "…"} ]
}
```

A ledger entry is first proposed by one delegate (1 signature, "pending") and
co-signed by others until it reaches threshold. Then it becomes canonical
everywhere it propagates. Two entries with the same `seq` that both reach
quorum would mean delegates double-signed; nodes reject the second one and
flag the equivocation in the UI.

## 8. Merge, history, rollback

### 8.1 Patches (pull requests)

A patch is a COB (§9) containing **revisions**. Each revision points at a
commit in the author's namespace plus a base commit. Pushing to a patch
branch adds a revision; nothing is overwritten, so reviewers can always diff
revision 2 against revision 3.

### 8.2 Review

A review is a signed op on the patch: `approve | request-changes | comment`,
bound to a specific revision OID. If a new revision is pushed, approvals for
older revisions are shown as stale.

### 8.3 Merge

Merge strategies: `merge-commit`, `squash`, `rebase` (fast-forward only on the
result). Flow:

1. A delegate clicks **Merge**. The node builds the merge commit locally,
   checks policy (reviews, attestations, signed commits), and appends a
   **pending ledger entry** signed by that delegate.
2. The entry gossips. Other delegates see "Merge awaiting your signature
   (1/2)". They verify the same merge result (deterministic: same parents,
   tree, and author metadata) and co-sign.
3. At threshold, every node advances canonical `main`. The patch COB gets a
   `merged` op referencing the ledger seq.

Single-delegate repos (`threshold: 1`) merge instantly, just like GitHub.

### 8.4 Rollback

Two tools, deliberately separated:

| Tool | What it does | When |
|------|--------------|------|
| **Revert** | New commit undoing a change; normal merge flow | Bad change, history should show the fix |
| **Rollback** | Ledger entry of `kind: rollback` moving canonical ref to an earlier commit in its own history; needs threshold signatures + a reason | Bad release, compromised push, broken main |

Rollback never deletes anything. The commits that were "rolled away" stay in
the object store and in the ledger, so **rolling back a rollback** is just
another entry pointing forward again. The UI shows a timeline with the
rolled-back range dimmed, not erased.

Personal branches are owned by their author, who can force-push their own
namespace at will. That cannot affect anyone else's view.

### 8.5 Leaked secrets

If a secret is committed and replicated, it cannot be recalled. SHARD helps:

1. Pre-commit and pre-announce secret scanning (local, before data leaves).
2. `shd redact <oid>`: publishes a signed tombstone; compliant nodes drop the
   object and stop serving it. Non-compliant peers may still hold it.
3. The UI forces the honest message: **rotate the secret**.

## 9. Collaborative objects (COBs)

Issues, patches, reviews, releases, discussions, CI attestations and
org/team docs all use one mechanism:

- Each COB is a DAG of **ops**, each op a Git commit signed by its author,
  with Lamport timestamp and parent ops.
- Each peer keeps their own op chain for a COB in their namespace; the
  merged view is the union of all chains.
- State is computed by replaying ops in a deterministic topological order
  (Lamport, then op hash). Types define CRDT semantics: LWW registers for
  title/state, OR-sets for labels/assignees, RGA for comment threads.
- Authorization is per op type: anyone can comment; only the author or a
  delegate can close; only delegates can merge. Unauthorized ops are kept
  but ignored, so that a later policy change can't rewrite history.

This means issues and PRs **work offline** and **sync like code**.

## 10. Teams and orgs

An org is a SHARD repo with no code, only an org identity doc:

```yaml
org: shd:zOrgCyber…
name: cyberninai
members:
  did:key:z6MkAda…: [owner]
  did:key:z6MkLin…: [owner, maintainer]
  did:key:z6MkKai…: [maintainer]
  did:key:z6MkJun…: [contributor]
teams:
  maintainers: { roles: [maintainer], repos: ["*"] }
  infra:       { members: [did:key:z6MkKai…], repos: ["shd:z3vX…"] }
policy:
  change_members: 2-of owners
  seeds: [ "/dns4/seed1.cyberninai.dev/udp/4001/quic-v1/p2p/12D3…" ]
```

Roles map to capabilities:

| Role | Read private | Push branches | Review | Merge (sign ledger) | Change policy |
|------|:-:|:-:|:-:|:-:|:-:|
| reader | ✓ | | | | |
| contributor | ✓ | ✓ | ✓ | | |
| maintainer | ✓ | ✓ | ✓ | ✓ | |
| owner | ✓ | ✓ | ✓ | ✓ | ✓ (with threshold) |

A repo delegate entry can be `org:<id>#<team>`, so membership changes in the
org flow through to every repo without editing each one. Adding or removing a
member is an org-doc update signed by `change_members` quorum. For private
repos this also triggers a **key epoch rotation** (§11).

## 11. Privacy

### 11.1 Visibility levels

| Level | Discovery | Who can fetch | At rest on seeds |
|-------|-----------|---------------|------------------|
| Public | DHT + gossip + indexers | anyone | plaintext |
| Unlisted | not announced; ID shared out-of-band | anyone with the ID | plaintext |
| Private | blinded rendezvous only | authorized PeerIds only | plaintext on trusted seeds, encrypted on blind seeds |
| Sealed | blinded, onion transport preferred | authorized only | always encrypted; even metadata (ref names) encrypted |

### 11.2 Encryption for private and sealed repos

- Each private repo has an **MLS group** (RFC 9420) of authorized devices.
  MLS gives an epoch secret that rotates on every membership change, with
  forward secrecy and post-compromise security.
- For **trusted nodes** (members' own devices, org seeds holding the key),
  data replicates as normal Git over the Noise-encrypted channel.
- For **blind seeds** (rented storage, a friend's box), the node uploads
  `bundle = AEAD(epoch_key, git-bundle(new objects))`. The blind seed stores
  and serves opaque blobs addressed by hash. It knows the size and timing,
  not the content.
- Removing a member creates a new epoch. Future content is unreadable to
  them. Content they already had stays theirs; the UI says this plainly at the
  removal step.

### 11.3 Metadata minimization

- Private announcements gossip on a topic derived from the blinded ID, with
  payload encrypted to the group.
- Seeds can be required to be reached via onion transport (Tor/Arti) per repo.
- No telemetry. The local node API only binds to localhost and requires a
  session token from the desktop app.

## 12. CI as attestations

There is no central runner. Runners are nodes with a runner key and a policy
("I build repos of org X"). On a new patch revision, runners fetch, build,
and publish a signed **in-toto/SLSA attestation** COB:
`{subject: commit, predicate: "ci/test", result: pass, log_bundle: <oid>}`.
Branch protection requires attestations from keys listed as trusted runners.
Two independent runners agreeing on a result can be required for releases
(reproducible-build check).

## 13. Abuse resistance

- Seeds default to `scope = followed`: they replicate delegates and peers
  they follow, not arbitrary strangers' namespaces.
- Per-peer rate limits on gossip and fetch; unknown peers get small quotas.
- Optional proof-of-work stamp on unsolicited patch/issue ops from
  non-followed peers in popular public repos.
- Local and org-shared blocklists (themselves signed, subscribable docs).

## 14. Consistency and failure modes (honest list)

| Situation | Behaviour |
|-----------|-----------|
| Delegates offline | Merges wait in "pending signatures" state; contributors keep working |
| Delegates diverge | UI shows a split; no automatic winner |
| Network partition | Both sides keep working; COBs merge on reconnect; ledger needs quorum, so at most one side can advance a protected ref |
| Only one seed has an old object | Fetch from whoever has it; UI shows replication health (number of seeds holding each ref) |
| Lost root key, no recovery set up | Identity is lost; repos survive under other delegates. Onboarding pushes hard for recovery setup |

## 15. Tech choices

| Concern | Choice | Why |
|---------|--------|-----|
| Node | Rust (`shardd`) | Memory safety, `rust-libp2p`, `gitoxide` |
| Git | `gitoxide` + stock git compatibility via `git-remote-shard` helper | Pure-Rust, fast, embeddable |
| P2P | `rust-libp2p` | QUIC, Noise, Kad, GossipSub, DCUtR, Relay all exist |
| Group crypto | `openmls` | RFC 9420 |
| AEAD | XChaCha20-Poly1305 | Nonce-misuse margin for large bundles |
| Local index | SQLite + FTS5 | Search across COBs and code |
| UI | TypeScript + Svelte or React, served by the node | Local-first, no hosted frontend |
| Desktop | Tauri | Ships node + UI, small binary |

## 16. Prior art

Radicle (heartwood) is the closest system and validates the
namespaces + sigrefs + COB approach; SHARD differs in its ref ledger with
quorum signatures, MLS-based private repos with blind seeds, org docs with
team-scoped delegation, and attestation-gated merges. Also informed by
git-bug (issues in Git), Keybase (sigchains), IPFS/libp2p, and Sigstore/in-toto.
