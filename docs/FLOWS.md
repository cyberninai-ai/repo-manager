# SHARD User Flows

Each flow shows what the user does (UI and CLI), what the node does
underneath, and what goes over the network. CLI is `shd`; plain `git` works
for everything code-related.

---

## F1. First run: create your identity

**UI:** Welcome screen → "Forge identity" → choose handle → plug in hardware
key (or "store in OS keychain") → set up recovery (pick 3–5 trusted peers or
print a recovery sheet) → done.

```sh
shd auth init --handle ada
shd auth recovery --shamir 3-of-5 --peers @lin @kai @jun @mo @rae
```

**Node:** generates root key + device key, writes identity doc commit, starts
libp2p, bootstraps DHT from seeds in config.
**Network:** identity doc is published only when you first share a repo or
follow someone.

## F2. Add a second device

Laptop shows a QR code / 6-word phrase → phone scans → laptop root key
signs a certificate for the phone's device key → identity doc updated →
phone syncs your repos from the laptop over LAN (mDNS) or relay.

```sh
shd device add          # on new device, prints pairing code
shd device approve <code>   # on trusted device
```

## F3. Create a repo

**UI:** "+ New shard" → name, visibility (public / unlisted / private /
sealed), delegates (just me / me + team / org team), threshold, seeds.

```sh
cd my-project
shd init --name repo-manager --private --delegates @ada,@lin --threshold 2 \
         --seed org:cyberninai
```

**Node:** writes genesis repo identity doc → repo ID `shd:z3vX…` = hash of
genesis. For private: creates MLS group with delegates' devices.
**Network:** public → DHT provider record + gossip subscribe; private →
blinded rendezvous + encrypted invite to delegates.

## F4. Clone

```sh
shd clone shd:z3vXk9…      # or: git clone shard://z3vXk9…
```

Node looks up providers in DHT (or blinded key) → connects to closest 3
seeds → fetches identity doc first and verifies the genesis hash matches
the ID → fetches delegates' namespaces → computes canonical refs → checks out
`main`. UI shows the replication indicator: "held by 4 seeds · 2 delegates
online".

## F5. Commit and push

```sh
git switch -c feat/quic-sync
git commit -S -m "Sync peers over QUIC"
git push shard feat/quic-sync        # alias for: shd push
```

**Node:** secret scan → signs commit with device key (if not already) →
updates your namespace → re-signs sigrefs → gossips announcement.
**UI:** branch appears under "Your branches" with a live counter of peers
that have replicated it.

Nothing about canonical `main` changes. You only ever write to **your**
namespace.

## F6. Open a patch (pull request)

**UI:** Branch → "Open patch" → title, description, target `main`, reviewers.

```sh
shd patch open --base main --title "Sync peers over QUIC"
```

Creates patch COB with revision r1 = (base, head). Delegates and watchers
get it via gossip and see it in their inbox even if they were offline when
it was opened.

Updating: `git push` to the same branch → `shd` asks "add revision r2 to
patch #12?" → yes. Reviewers see an "r1 → r2" interdiff.

## F7. Review

**UI:** Files tab with inline comments → "Approve r2" / "Request changes".
Each review is a signed op bound to r2's OID. Comments work offline and sync
later.

```sh
shd patch review 12 --approve --rev r2 -m "LGTM"
```

Checks panel shows CI attestations: `ci/test ✓ by runner-ams-1 (signed)`.

## F8. Merge (with quorum)

**UI:** Merge box shows the policy checklist live:

```
 ✓ 1 approving review on latest revision
 ✓ attestation ci/test from trusted runner
 ✓ all commits signed
 ◐ delegate signatures 1/2   [@ada ✓] [@lin …]
```

1. @ada clicks **Merge → squash**. Node builds the squash commit
   deterministically and appends a pending ledger entry signed by @ada.
2. @lin gets a notification "Merge #12 awaits your signature". She
   clicks **Co-sign**; her node independently rebuilds the commit, checks
   that the OID matches, and signs.
3. Quorum reached → canonical `main` advances on every node that receives the
   entry. The patch is marked merged with the ledger seq.

```sh
shd merge 12 --squash          # proposer
shd ledger sign 42             # co-signer
```

If threshold is 1, step 2 does not exist: merge is instant.

## F9. Browse history

Two views, side by side:

- **Commits:** classic graph (lanes per branch), signature badge per commit
  (✓ verified device key / ⚠ unknown key / ✗ invalid).
- **Ledger:** every canonical ref move: merge, push, revert, rollback, tag,
  policy. Each row expands to show signers, attestations and the reason.
  Rolled-back ranges appear dimmed with a strike line.

```sh
shd log --ledger main
shd log --graph
```

## F10. Rollback

**Scenario:** release `v0.9` broke production; `main` contains three bad
merges.

**UI:** Ledger → pick entry #39 (last good) → "Roll back main to here" →
modal shows exactly which entries/commits will be detached (not deleted),
demands a reason, shows signatures needed (2/2).

```sh
shd rollback main --to-ledger 39 --reason "v0.9 corrupts peer table"
```

Pending until threshold co-sign → canonical `main` moves back → working
copies get a notice "main moved backwards via rollback #43 (reason…)" with
a one-click rebase helper for open branches.

**Undo:** pick the rollback entry → "Restore forward" → another ledger entry.

**Revert alternative:** "Revert this merge" opens a normal patch with the
inverse diff. Prefer this when the bad change should stay visible in code history.

## F11. Teams

**Create org:** "+ New org" → name → add owners → set policy
(`change_members: 2-of owners`) → choose org seeds.

**Invite member:** Org → Members → "Invite" → paste DID or scan their QR →
pick role/teams. Pending until second owner co-signs. The invitee receives
a signed invite; accepting adds their devices to the MLS groups of every
private repo the team can access.

**Remove member:** same flow; UI warns: *"@jun will lose access to new
commits. Code they already synced cannot be recalled. Rotate any secrets
they had access to."* On quorum, the key epoch rotates for affected repos.

```sh
shd org member add cyberninai @kai --role maintainer --team infra
shd org member rm cyberninai @jun
```

## F12. Privacy settings

Repo → Settings → Privacy:

- Visibility switch with an explanation of each level and the
  consequences of the change (public → private does not unpublish
  existing clones: UI says so).
- **Replication map:** which nodes hold this repo, trusted vs blind, last
  seen, current key epoch each holds.
- Blind seeds: add a storage node that will only ever see ciphertext.
- Transport: "Require onion routing for this repo".
- Key epochs: list of rotations with reason (member removed, device revoked,
  scheduled).

## F13. Issues

Same as patches without code: `shd issue open`, labels, assignees,
comments. Fully offline. Closing requires author or delegate. Issues can
reference commits, patches and ledger entries (`#L42`).

## F14. Release

```sh
shd release v1.0 --from main
```

Creates a signed tag via ledger entry (`kind: tag`, threshold
signatures), optionally requires two matching reproducible-build
attestations. Artifacts are stored as Git blobs or referenced by content
hash on seeds.

## F15. Fork

A fork is not a copy on someone's server. It is a new repo identity doc whose
genesis references the parent ID and commit. Patches can flow upstream
because both share object history; the UI shows "forked from" with live
divergence stats.

## F16. Device lost

From another device or recovery peers: "Revoke device" → identity doc
update → peers reject any new signatures from that key → MLS epoch rotates
for every private repo it was in.
