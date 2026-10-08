# Scoped Claim Authorization: research plan

Status: protocol ready, **no sessions run**. This is the plan and the report
template. It contains no findings. Results go in §7 once sessions happen.

Spec: [`SPEC.md`](SPEC.md) · Stimulus: [`prototype/scoped-claim/index.html`](../../prototype/scoped-claim/index.html)

## 1. Questions

| ID | Question | Decides |
|----|----------|---------|
| R1 | Can users describe in their own words what they'd be signing? Which fields do they ignore, and which confuse them? (Focus terms: *Scope*, *Authority*, *Manifest digest*, *Claim Stack*) | Copy and labels; whether any field needs a consequence line like Visibility has |
| R2 | Where does defxn's current wording or field set differ from flux-dao-app's `ScopedAuthorizationDialog`? | Bug list (any user-visible difference is a bug) |
| R3 | Does the full modal every time cause fatigue and dismissal, or build trust, compared with a reduced variant? | Validates or falsifies the product bet |
| R4 | Which field is skipped most, and does hierarchy or copy recover attention? | Group order, lede sentence, pinned items |

## 2. Participants

- **R1, R3, R4:** 8 people (the brief's range is 5–8; take 8 to allow for no-shows and for
  the 4/4 split in R3).
  - 4 existing defxn users who have signed at least one transfer or publish.
  - 4 people new to defxn but familiar with any wallet signing prompt.
  - At least 2 who mainly use a phone.
- **R2** is an expert review (designer + engineer), not a user study.

## 3. Stimuli

- **Current**: defxn staging, the real `authorization-dialog.js`, for transfer
  and CMS publish. (Identity publish has no current version.)
- **Proposed**: `prototype/scoped-claim/` for all three actions.
- **Reduced (research only)**: the proposed modal limited to Action,
  Callsign, Expires and the Sign button. It is built only as a test
  stimulus in a throwaway branch and **never ships**. Having it in the study
  is how we test the bet, not a hedge on it.
- **Planted defects**, one per participant, rotated: (a) visibility *Mesh
  directory · all peers* when the task said "just my DAO"; (b) a
  transfer amount in the manifest that differs from the task; (c) expiry 20 s
  away; (d) requester origin not matching the page they came from. These
  measure whether people actually read, which self-report can't.

## 4. Session (60 min, moderated, remote, screen + think-aloud)

1. **Warm-up (5 min)**: last time you approved something in a wallet or app,
   what did you look at?
2. **Current modal (15 min)**: transfer task, then publish task. After
   each, close the modal and ask for the **teach-back** below.
3. **Proposed modal (20 min)**: same two tasks plus identity publish, using
   the same teach-back. One of the three requests contains this participant's planted defect.
4. **Full vs reduced (R3, 10 min)**: a run of 6 back-to-back signing
   requests. Participants 1–4 see full, then reduced; 5–8 see reduced, then full.
   The 5th request in each run carries a planted defect.
5. **Term probes (R1, 5 min)**: point at each focus term and ask, "What would
   you tell a friend this means?"
6. **Wrap (5 min)**: preference, and "which of these would you trust with
   your treasury, and why?"

**Teach-back prompt** (unchanged every time): *"Without looking back, tell
me what you just agreed to: what, as whom, for whom, and until when."*

## 5. Measures

| Measure | How | Target for the proposed modal |
|---------|-----|-------------------------------|
| Teach-back accuracy | Score 0–2 on each of: action, callsign, authority, visibility, expiry, content (amount / page / profile). Max 12 | ≥ 10 median |
| 10-second read | Show the modal for 10 s, hide it, then ask the teach-back | ≥ 4 of 6 facts |
| Planted-defect catch rate | Did they stop before Sign? | Full ≥ 75%; report reduced alongside |
| Fatigue | Time on modal, requests 1 vs 6 in the R3 run; any "I just click through" remarks | Time drop ≤ 40% on full, with catch rate holding |
| Per-field attention | Think-aloud mentions + pointer dwell per row | Find the minimum (R4) |
| Term comprehension | Probe answers coded correct / partial / wrong | ≥ 6/8 correct or partial per term |
| Trust | 1–7 "I know what I signed", after each modal | Full ≥ reduced |

**Decision rules (R3)**, agreed before the data:

- Full catches more defects and trust is no lower → **bet holds**.
- Catch rates are equal and full shows more fatigue → the bet is
  **unproven**. Keep one modal, but rework the hierarchy (R4) before
  rollout. Don't introduce a reduced variant; the brief rules it out.
- Reduced catches more defects → **bet falsified on hierarchy, not on
  consistency**. The default view is too dense. Move rows to the inspect
  layers *for every action equally* and re-test.

## 6. R2 expert review checklist

For each of the 13 elements × 3 actions, record:
label string (defxn) · label string (`ScopedAuthorizationDialog`) ·
value formatting · order · present in default view? · present at all?
Every mismatch becomes a bug. Fix upstream in `@deadark/ark-ui` where the
element itself is the cause.

## 7. Report template (fill after sessions)

```
## Summary (3 bullets)
## R1 Comprehension
  teach-back scores: current vs proposed, per fact
  focus terms: per term correct/partial/wrong, verbatim quotes
## R2 Divergence bug list (link issues)
## R3 Full vs reduced
  catch rate · fatigue · trust · decision per §5 rule
## R4 Most-skipped field
  field · evidence · recommended change · re-test result
## Changes to SPEC.md
```

## 8. What to watch for (hypotheses, not findings)

- **Requester** and **Network** are likely the most skipped, because they
  look the same on every request. That's harmless until a phishing
  requester appears. If confirmed, consider flagging a requester origin
  that differs from the current route in `--warning`.
- **Scope** and **Claim Stack** are the jargon most likely to confuse.
  Candidate fixes to test: a one-line gloss under Scope ("what this
  signature is allowed to touch"), and renaming the row to *"Why you're
  allowed to do this"* with "claim stack" kept as the layer heading.
- **Manifest digest** will probably be ignored by most people. The design
  doesn't depend on them reading it, since the browser checks it. Measure
  whether the footer line is what earns trust instead.
