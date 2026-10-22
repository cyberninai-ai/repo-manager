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

## Flow templates: drop one in

Data → *Build a flow* → **Flow templates…** opens a gallery of ready-to-run flows, grouped by kind of work. The palette lists them too (⌘K → "Drop in flow"). Each one is placed in a free spot on the canvas you're on: where you're looking if that's empty, otherwise below your work. The view moves to show it, with the flow selected so you can press ▶ Run. They are ordinary nodes, so you can change any of them.

| Kind of work | Flows |
|---|---|
| Writing | **Blog post: outline to draft** (headings, then a draft; AI writes it) · **Editing pass** (lists sentences over 20 words) |
| Coding | **Landing page builder** (a table of sections, code that writes HTML, the page rendered on the canvas) · **Spec to test plan** (high-priority requirements onto a test checklist) · **Live code sketches** (an animation and a small app running on the canvas) |
| Design | **Palette from brand colours** (swatches with tints, rendered) · **Design critique to ideas** (feedback split, de-duplicated, ideas on notes) |
| Video editing | **Edit decision list** (best-rated clips in order with running timecodes) · **Script to shot list** (numbered shots with time estimates) |
| Marketing | **Launch posts** (features and benefits to post drafts on notes) |
| Research | **Interview synthesis** (tagged quotes grouped into ranked themes) |
| Product | **Prioritise with RICE** (scored, sorted, top three into the next sprint) |
| Meetings | **Meeting notes to actions** (lines starting "Action:" onto a checklist) |

Every one runs without AI. The responding steps use the built-in responders until AI is connected, then use it.

## Code on the canvas

- **Live code** (Data → Live code): write HTML, CSS and JavaScript, or JavaScript that draws on a canvas (`canvas` and `ctx` are ready, sized to the node), and it runs right on the board.
  - Double-click it to open the editor beside it. The node updates as you type.
  - Your changes are unsigned, and only you see them, until you press **Sign this version**.
  - Resize the node to give the code room. Select it to interact with what it shows (click buttons, scroll).
- **Run code step** (`do: code`): the body of a function of `items`; what it returns flows on. Return a list of items or strings, one string, or a number.
- **Results** (`results` node): put it at the end of a flow. It shows what arrives as a list, a table of the fields, text, cards, or a **page**. A page renders the items as HTML, so a flow that writes a web page shows that page on the canvas.

### Safety

- **Flow code** runs in a sealed worker. It has no network (`fetch`, `XMLHttpRequest` and `WebSocket` are removed), no storage, and no access to the page, and it is stopped after two seconds.
- **Live code and result pages** render in frames with `sandbox="allow-scripts"`, which gives them no origin, so they can't read the app, your keys or your storage. A content policy (`default-src 'none'`) blocks every network request from inside.
- **Code someone else wrote never runs by itself:**
  - their live code shows "▶ Run code by Ben" until you click it;
  - a flow containing their code steps asks first and names them; *Cancel* means nothing runs;
  - a page from their run waits for a click.
  - The choice lasts for the browser session.

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
- `flow/sandbox.js`: the sealed worker, the live frames and the consent to run others' code;
- `flow/output.js`: the Code step, the Results node, the live-code node and its editor;
- `flow/demos.js`: the drop-in flows (`FLOW_DEMOS`: nodes as `[key, kind, x, y, label, parent?, options?]` plus connectors), the gallery and `dropDemo(id)`;
- `flow/panel.js`: the panel, the live view, the palette and the template.

`tests/livecode.mjs` (29 checks, two people) covers:
- the live editor updating the canvas as you type, and signing;
- Ben clicking before Ana's code runs;
- the Code step, including a runaway loop and blocked network and storage;
- asking before running someone else's code, where "no" means no run;
- every demo flow dropping in and running without errors;
- the landing page rendered on the canvas, which Ben sees only once he asks.

Tests: `tests/pipes.mjs` runs two people over WebRTC, with a stand-in AI on one side only (21 checks). It covers building a flow through the menus, a table feeding a step, one click on Run, and that the filter only passes data. It also checks that the AI responds and writes rows, that the other person sees the identical responses without AI, and that their own run uses the built-in responders. Finally it covers a missing responder, a loop, and a hostile run log.
