# Flux Canvas

A collaborative canvas for brainstorming, idea building, feedback, stories, moodboards and audits. **Every note, stroke, vote and decision is a signed, content-addressed pattern**, so who did what is provable, not just recorded.

- **Use it:** open `../flux-canvas.html` in any browser. It's one self-contained file with no server and no install. Tabs in the same browser sync on their own.
- **Work together peer to peer:** open the Live button, create an invite code, and swap codes with someone. You're connected browser to browser, no server. You see each other's names, cursors and selections, and can follow each other.
- **Deliver and prove:** turn notes into tasks (K), then send the canvas for approval to named people. Each approver signs that exact version; the proof file shows who contributed and who approved.
- **Run the whole team loop:** the Team button (four squares, top right) holds twenty-one team features: silent rounds, facilitated meetings, ritual contracts, a consensus map, a decision ledger, claim grounding, sealed bids, approval flows, contribution proof, payouts, witnesses, replay, forks with royalties, a cross-canvas graph, linked devices with guardian recovery, a mesh relay and more. See [docs/FEATURES.md](docs/FEATURES.md).
- **Put data on the canvas:** the Data button (or D) adds tables, checklists, metrics, charts, formulas, dates, links and code. Anyone can change a cell, tick an item or log a value, and each change is one signed record, so edits made at the same moment never collide. Charts follow their table or metric live, and formulas compute across the canvas by name: `[Revenue] / [Costs]`. See [docs/DATA.md](docs/DATA.md).
- **Run flows:** chain notes, data and steps in order and press Run. Some steps only pass data on (filter, sort, format), some respond (ask, ideas), some write back (notes, rows, readings). Every run is signed with what each step produced, so everyone sees the same answers. AI connects as a responder. Drop in ready-made flows for writing, coding, design, video editing, marketing, research, product and meetings. Write code that runs right on the canvas, in sealed frames. See [docs/FLOWS.md](docs/FLOWS.md).
- **Work together across machines:** run `npm run relay` (Node only, no dependencies) and open the address it prints. Anyone who opens the same canvas link on that relay joins live. Or use Share → Go live with any relay address.
- **Develop it:** this folder holds the modular source behind that file.

```sh
npm install          # test tooling only (playwright, axe-core)
npm run serve        # http://localhost:8080 — the source, file by file
npm run build        # rebuild ../flux-canvas.html from index.html + css/ + js/
npm test             # browser suites on the bundle  (npm run test:source for the source)
npm run check        # CI: fail if the bundle is stale or a module breaks the layer rules
npm run relay        # http://localhost:8787 — the app plus live sync between browsers (records kept in relay-data/)
```

## Deliverables for the team

| Document | What it gives you |
|---|---|
| [docs/PRODUCT.md](docs/PRODUCT.md) | What we are building, for whom, and how to explain it |
| [docs/FLOWS.md](docs/FLOWS.md) | Flows: steps that pass data, respond or write; running; the RUN record; connecting AI as a responder |
| [docs/DATA.md](docs/DATA.md) | Data nodes: the eight kinds, the CELL, TICK, READING and ROW records, formulas, and how to add a kind |
| [docs/FEATURES.md](docs/FEATURES.md) | The twenty-one team features: what each does, its records, how they are isolated and how they compose |
| [docs/AUDIT.md](docs/AUDIT.md) | Findings by area and severity, what this pass fixed, what's open |
| [docs/PLAN.md](docs/PLAN.md) | The phased plan: principles, what each phase delivers, acceptance checks, next work |
| [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) | Generated module graph: who uses what, checked against the layers |
| [docs/DESIGN.md](docs/DESIGN.md) | The design system: layout, tools, contextual style bar, tokens, components, accessibility |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layout, load order, data flow, global state, extension hooks, component table, module map, how to add a feature |
| [docs/PATTERNS.md](docs/PATTERNS.md) | The record format: grammar, every record type, authority rules |
| [docs/USE-CASES.md](docs/USE-CASES.md) | Each use case: its template, its worked example, what to try |

## Source at a glance

- **`index.html`:** every component's markup, then the stylesheets and scripts in load order.
- **`css/`:** one stylesheet per surface.
- **`js/core`:** data (grammar, identity, records, derive, hooks).
- **`js/render`:** drawing.
- **`js/model`:** commands.
- **`js/interaction`:** input.
- **`js/ui`:** chrome and panels.
- **`js/features`:** one file per capability.

A feature plugs in through `core/hooks.js` (record types, render layers, change and frame hooks, toolbar, palette, keys, templates, examples) without touching the core. `tools/deps.mjs` keeps the layers honest.
