# SHARD Roadmap

## Phase 0: Prototype (this repo, now)
- Architecture, data model, flows, design system
- Clickable UI prototype with in-memory state

## Phase 1: Core node (8–10 weeks)
- `shardd` in Rust: identity (root + device keys, keychain), identity doc chain
- Git storage with namespaces + sigrefs (gitoxide)
- libp2p: QUIC/Noise, Kademlia, GossipSub, mDNS, relay + DCUtR
- `shd init / clone / push / sync`, `git-remote-shard` helper
- Public repos only; threshold = 1
- **Exit test:** two laptops behind different NATs clone and push to each other with no seed.

## Phase 2: Collaboration (6–8 weeks)
- COB engine (op DAG, Lamport, deterministic replay)
- Patches with revisions, reviews, comments; issues
- Local web UI v1 served by node: repo, code, commits, patches, issues
- SQLite FTS index

## Phase 3: Governance (6 weeks)
- Repo identity doc with delegates, threshold, protection rules
- Ref ledger: proposals, co-signing, quorum, equivocation detection
- Merge strategies, rollback / restore, revert-as-patch
- History UI: commit graph + ledger timeline

## Phase 4: Teams and privacy (8 weeks)
- Org docs, roles, team-scoped delegation, member invite/remove with quorum
- Private repos: authorized-peer fetch, blinded rendezvous
- MLS groups (openmls), key epochs, encrypted bundles for blind seeds
- Device add/revoke, social recovery

## Phase 5: Platform (ongoing)
- CI runners + attestations, attestation-gated merges, reproducible release checks
- Seed operator package, policy UI, replication health
- Desktop app (Tauri), mobile read/review client
- Sealed visibility, onion transport
- GitHub import (repos, issues, PRs → COBs) and mirror-out bridge

## Open questions
1. Should canonical refs for unprotected branches also use the ledger, or is
   fast-forward agreement enough?
2. Large files: native chunked blobs on seeds vs. LFS-compatible pointer
   files.
3. Search across the network: opt-in indexers risk centralization; how do
   we keep them replaceable?
4. Social recovery UX: how to make 3-of-5 setup feel like a 30-second step.
5. Equivocating delegates: automatic freeze of the ref vs. manual resolution.
