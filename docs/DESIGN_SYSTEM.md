# SHARD Design System: "Terminal Noir"

The feel: a secure operations console. Dark, precise, alive with network
activity. The UI makes cryptography *visible* (signatures, quorums, epochs,
peers) without making it scary. Neon is for meaning, not decoration.

## Principles

1. **Signals are colored, chrome is not.** Neutrals carry layout; color means
   status (verified, pending, danger, private).
2. **Show the trust.** Every authoritative action shows who signed it and how
   many more signatures it needs.
3. **The network is alive.** Peers, replication and gossip are visible
   ambiently (status bar, pulse dots), never blocking.
4. **Honest consequences.** Destructive or irreversible-by-nature actions
   (remove member, change visibility, rollback) say exactly what cannot be
   undone.
5. **Keyboard first.** `⌘K` palette, `g c` commits, `g p` patches, `g l` ledger.

## Color tokens

| Token | Dark | Light | Meaning |
|-------|------|-------|---------|
| `--bg` | `#07090d` | `#f4f6f8` | page |
| `--panel` | `#0d1117` | `#ffffff` | cards |
| `--line` | `#1c2430` | `#d9dee5` | borders, grid |
| `--text` | `#d7e1ea` | `#0e141b` | body |
| `--muted` | `#6b7a8c` | `#5b6775` | secondary |
| `--cyan` | `#00e5ff` | `#007c8c` | primary action, links, focus |
| `--green` | `#39ff88` | `#0a8a45` | verified signature, merged, healthy |
| `--amber` | `#ffb020` | `#9a6200` | pending quorum, stale review |
| `--magenta` | `#ff2bd6` | `#b00f95` | private / encrypted / key material |
| `--red` | `#ff3b5c` | `#c4183a` | invalid signature, rollback, danger |

Glow: `box-shadow: 0 0 0 1px color-mix(in srgb, var(--cyan) 40%, transparent), 0 0 18px -6px var(--cyan)`, only on focus and live states.

## Type

- UI and code: **JetBrains Mono** (400/500/700)
- Display headings: **Space Grotesk** 600, uppercase, letter-spacing .08em
- Sizes: 12 / 13 (base) / 15 / 20 / 28

## Signature language

| Glyph | Meaning |
|-------|---------|
| `◆` green | signed by known device key |
| `◇` amber | signature pending / required |
| `◆` red | invalid or revoked key |
| `⬡` magenta | encrypted / private |
| `●` pulse | peer online |

Quorum meter: a row of hexagons, filled per signature: `⬢⬢⬡  2/3`.

## Components

- **Status bar** (bottom, always): node online state, peers, DHT size,
  repos seeding, current key epoch, sync activity ticker.
- **Repo header:** name, visibility chip, repo ID (click to copy), replication
  health (`held by 5 · 2 blind`), delegates avatars with quorum.
- **Quorum card:** policy checklist + signer slots + primary action.
- **Ledger row:** seq, kind chip, from→to short OIDs, signers, reason; rolled
  back ranges at 40% opacity with a red left rule.
- **Commit graph:** SVG lanes, 2px strokes, nodes as small hexagons.
- **Peer map:** force layout, nodes colored by trust (cyan member, gray
  stranger, magenta blind seed).
- **Consequence modal:** red top rule, "What happens" / "What can't be
  undone" sections, typed confirmation for irreversible ops.

## Motion

- 150ms ease-out for state changes; signatures "lock in" with a 300ms glow
  pulse. Respect `prefers-reduced-motion`: no pulses, no ticker scroll.
- Optional subtle scanline overlay (2% opacity), off in light mode and in
  reduced-motion mode.
