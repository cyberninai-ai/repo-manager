# Flux Canvas

A collaborative canvas for brainstorming, idea building, feedback, stories, moodboards and audits. **Every note, stroke, vote and decision is a signed, content-addressed pattern**, so who did what is provable, not just recorded.

- **Use it:** open `../flux-canvas.html` in any browser. It's one self-contained file with no server and no install.
- **Develop it:** this folder holds the modular source behind that file.

```sh
npm install          # test tooling only (playwright, axe-core)
npm run serve        # http://localhost:8080 — the source, file by file
npm run build        # rebuild ../flux-canvas.html from index.html + css/ + js/
npm test             # browser suites on the bundle  (npm run test:source for the source)
npm run check        # CI: fail if the bundle is stale
```

## Deliverables for the team

| Document | What it gives you |
|---|---|
| [docs/AUDIT.md](docs/AUDIT.md) | Findings by area and severity, what this pass fixed, what's open |
| [docs/PLAN.md](docs/PLAN.md) | The phased plan: principles, what each phase delivers, acceptance checks, next work |
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

A feature plugs in through `core/hooks.js` (record types, render layers, toolbar, palette, keys, templates, examples) without touching the core.
