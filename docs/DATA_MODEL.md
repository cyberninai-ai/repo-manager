# SHARD Data Model

All structures are canonical JSON (RFC 8785 JCS) stored as Git blobs inside
commits, signed with Ed25519 over the JCS bytes. OIDs are Git SHA-256
(object format `sha256`).

## Identifiers

| Thing | Format | Derivation |
|-------|--------|------------|
| Person | `did:key:z6Mk…` | Root Ed25519 public key |
| Device / PeerId | `12D3KooW…` | Device Ed25519 key (libp2p) |
| Repo | `shd:z…` | multibase(sha256(genesis repo doc)) |
| Org | `shd:z…` (repo with `kind: org`) | same |
| COB | `<type>/<oid>` | OID of the COB's root op commit |
| Ledger entry | `L<seq>` | per repo, per protected ref family |

## Ref layout (per node, per repo)

```
refs/shard/id                                  repo identity doc chain
refs/shard/ledger                              canonical ledger chain
refs/shard/epochs                              MLS epoch announcements (private)
refs/namespaces/<did>/refs/heads/<branch>
refs/namespaces/<did>/refs/tags/<tag>
refs/namespaces/<did>/refs/shard/sigrefs       {refs: {name: oid}, parent, sig}
refs/namespaces/<did>/refs/cobs/<type>/<id>    that peer's op chain for a COB
refs/heads/*, refs/tags/*                      derived canonical refs (local only)
```

## Repo identity doc

```json
{
  "kind": "repo",
  "version": 1,
  "name": "repo-manager",
  "description": "Sovereign code mesh",
  "visibility": "private",
  "delegates": ["did:key:z6MkAda", "did:key:z6MkLin", "org:shd:zCyber#maintainers"],
  "threshold": 2,
  "default_branch": "main",
  "protect": {
    "main": {
      "require_reviews": 1,
      "require_attestations": ["ci/test"],
      "trusted_runners": ["did:key:z6MkRunnerA"],
      "require_signed_commits": true,
      "merge_strategies": ["squash", "merge"]
    }
  },
  "seeds": ["/dns4/seed1.cyberninai.dev/udp/4001/quic-v1/p2p/12D3KooW…"],
  "parent": null
}
```

Commit message trailer: `Shard-Signature: did:key:… <base64 sig>` (one
per signer). An update is valid iff signed by `threshold` delegates of the
**previous** version.

## Sigrefs

```json
{
  "refs": {
    "refs/heads/feat/quic-sync": "9d77e0…",
    "refs/cobs/patch/7c1f…": "a03b…"
  },
  "parent": "<previous sigrefs blob oid>",
  "device": "12D3KooW…",
  "signature": "…"
}
```

## Ledger entry

```json
{
  "seq": 43,
  "prev": "<oid of entry 42>",
  "ref": "refs/heads/main",
  "kind": "rollback",
  "from": "9d77e0…",
  "to": "4f2a1c…",
  "target_entry": 39,
  "reason": "v0.9 corrupts peer table",
  "patch": null,
  "attestations": [],
  "lamport": 1022,
  "proposer": "did:key:z6MkAda",
  "signatures": [{"did": "did:key:z6MkAda", "sig": "…"}]
}
```

`kind` ∈ `push | merge | revert | rollback | restore | tag | policy`.
Signatures are added by appending co-sign commits that reference the entry
OID; entry state = `pending` until signatures ≥ threshold at that time.

## COB op envelope

```json
{
  "cob": "patch/7c1f…",
  "type": "patch",
  "parents": ["<op oid>", "…"],
  "lamport": 917,
  "author": "did:key:z6MkLin",
  "action": {"type": "review", "revision": "r2", "verdict": "approve", "body": "LGTM"}
}
```

### Patch actions
`open{title, body, base, head}`, `revision{base, head, note}`,
`review{revision, verdict, body}`, `comment{reply_to, body, path?, line?}`,
`label{add, remove}`, `assign{add, remove}`, `edit{title?, body?}`,
`close`, `reopen`, `merged{ledger_seq, commit}`.

### Issue actions
`open`, `comment`, `label`, `assign`, `edit`, `close{reason}`, `reopen`,
`link{target}`.

### Attestation (CI)
```json
{
  "action": {
    "type": "attest",
    "subject": "9d77e0…",
    "predicate": "ci/test",
    "result": "pass",
    "log": "<blob oid>",
    "runner": "did:key:z6MkRunnerA",
    "duration_ms": 84213
  }
}
```

## Org doc

```json
{
  "kind": "org",
  "name": "cyberninai",
  "members": {
    "did:key:z6MkAda": ["owner"],
    "did:key:z6MkLin": ["owner", "maintainer"],
    "did:key:z6MkKai": ["maintainer"],
    "did:key:z6MkJun": ["contributor"]
  },
  "teams": {
    "maintainers": {"roles": ["maintainer"], "repos": ["*"]},
    "infra": {"members": ["did:key:z6MkKai"], "repos": ["shd:z3vX"]}
  },
  "policy": {"change_members": {"role": "owner", "threshold": 2}},
  "seeds": ["/dns4/seed1.cyberninai.dev/udp/4001/quic-v1/p2p/12D3KooW…"]
}
```

## Encrypted bundle (blind seeds)

```
header  = { repo_blind_id, epoch, prev_bundle, object_count, created_lamport }
payload = XChaCha20-Poly1305(key = HKDF(mls_epoch_secret, "shard/bundle"),
                             nonce = random 24B,
                             aad = JCS(header),
                             pt  = git bundle of new objects + encrypted sigrefs)
address = sha256(header || ciphertext)
```

Blind seeds store `(address → bytes)` and an index by `repo_blind_id`. They
cannot list refs, read code, or tell which authors pushed.

## Gossip messages

```
RefAnnouncement { repo, did, device, sigrefs_oid, lamport, sig }
LedgerProposal  { repo, entry_oid, seq, sig }
LedgerCosign    { repo, entry_oid, did, sig }
CobAnnouncement { repo, cob, tip_oid, did, sig }
EpochAnnouncement { blind_id, epoch, welcome_oid }     // private repos
```
