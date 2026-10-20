# Flux Canvas — flows

A **flow** chains things on the canvas in order and runs them as a pipeline. Notes, tables, metrics and other items pass their content along. **Steps** act on it. Each step does one of three things:

| Mode | What it does | Steps |
|---|---|---|
| **Passes data** | Changes what flows through and hands it on. The same input always gives the same output. | Filter, Sort, Take, Pick fields, Remove repeats, Split, Join, Format, Count, Total |
| **Responds** | A *responder* writes something new from what came in. This is where AI connects. | Ask (a prompt about the input), Ideas (new ideas from each item) |
| **Writes** | Puts the result back on the canvas as ordinary signed records. | Make notes, Add rows to a table, Add to a checklist, Log to a metric |

Every run is signed. A `RUN` record names the flow and carries a log of what every step produced. Everyone therefore sees the same responses and who produced them, even people with no AI connected. That matters most for AI answers, which aren't repeatable: the canvas records the answer that was actually given.

## Using it

1. **Start a flow:** Data button (or D) → *Build a flow* → **Flow**. Give it a name and, if you like, the items it starts with.
2. **Add steps:** with the flow (or the last step) selected, Data → **Step**, then pick an action. Fill in its settings and the step lands to the right, already connected.
3. **Bring in data:** connect any note, table, metric or checklist into a step with a connector (C, or the connector tool). Its content feeds that step. Notes in the chain add their words as context.
4. **Run it:** click **▶ Run** on the flow. The step at work is outlined, each step shows what came out ("✓ 3 in → 2 out"), and the Team → **Flows** panel lists every flow and what each step did.

The canvas home has a **Brainstorm flow** template. It takes pain points from a table, keeps the ones with the most votes, sparks ideas, and puts them on sticky notes.

### Order

A flow runs everything it reaches by following connectors (arrows and the links "+" handles make). It also runs whatever is connected *into* those items from outside, such as a table feeding a step. The order respects every connector; ties read left to right, then top to bottom. A step's input is the output of everything connected into it. A loop between steps is reported before anything runs, and another flow's start is never pulled in. A flow can have up to 60 steps.

### What travels

Each item is `{ text, f: { field: value }, n }`:

- a table row reads as its first cell, its cells are fields, and its first number column is its value;
- a checklist item has a `done` field;
- a metric or formula is its value, and a date is its days from today;
- a link has `title`, `url` and `note`;
- a note is its words.

Steps name fields by column name, case-insensitive: `Votes >= 4`, `sort by Price`, `{{Plan}} costs {{Price}}`. `text` and `value` always work.

## Connecting AI

A responder is one function. Register it and every *Ask* and *Ideas* step set to "Automatic" uses it in place of the built-in one:

```js
FLOW_RESPONDERS.ai = {
  name: 'Claude',
  run: async ({ kind, prompt, items, count, cfg, step }) => {
    // kind: 'ask' (prompt is filled in: {{all}} is every item, one per line) or 'ideas' (count ideas per item)
    // return a string, or a list of strings (one item each)
  },
};
```

- Built-in responders (`builtin: true`) are the fallback: *fill in the prompt*, and *idea prompts*, which turns each item into new angles (what if it were free, who else could use it, do it in reverse…) and combines the first two items.
- A step can name a responder explicitly (`using: ai`). If that responder isn't connected in the browser running the flow, the step says so and the run is marked as having errors.
- Responses are capped (500 items, 2,000 characters each) and stored in the signed log.

## Records

| Action | Fields | Rule |
|---|---|---|
| `RUN` | `I R V S C M` | `R` is the flow's first version, `V` the log blob (JSON), `S` `ok` or `error`, `C` the number of steps, `M` the flow's title. Anyone with "draw" may run a flow. Writes inside the run are ordinary records signed by the runner (permissions and zones apply). |

The log is untrusted: a peer could sign anything. Each reader rebuilds it field by field:

- only strings and finite numbers are kept;
- modes outside pass, respond and write become *pass*;
- texts are capped, and prototype keys are dropped;
- in the panel it's escaped text, and on the canvas it's drawn, never markup.

A run writes at most 100 things and a *Make notes* step at most 30.

Flow nodes and step nodes are data-node kinds (`flow`, `step`) in `js/features/flow/`, whose label is readable text:

```
Keep the big ones          ← a step: its name
do: filter                 ← its action
where: Votes >= 3          ← its settings (a prompt may span lines)
```

## For developers

A new action is one call:

```js
pipeStep('translate', { mode: 'respond', name: 'Translate', blurb: 'Into another language',
  fields: [{ id: 'to', label: 'Language', type: 'text', value: 'French' }],
  summary: c => `into ${c.to}`,
  run: async (items, cfg, ctx) => items.map(i => ({ text: … })) });
```

The modules are:

- `flow/engine.js`: the graph, the run, the steps, the responders and `RUN`;
- `flow/nodes.js`: the Flow and Step nodes, and adding steps;
- `flow/panel.js`: the panel, the live view, the palette and the template.

Tests: `tests/pipes.mjs` runs two people over WebRTC, with a stand-in AI on one side only (21 checks). It covers building a flow through the menus, a table feeding a step, one click on Run, and that the filter only passes data. It also checks that the AI responds and writes rows, that the other person sees the identical responses without AI, and that their own run uses the built-in responders. Finally it covers a missing responder, a loop, and a hostile run log.
