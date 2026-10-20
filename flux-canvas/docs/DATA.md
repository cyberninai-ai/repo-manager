# Flux Canvas — data nodes

A canvas holds notes and shapes. Data nodes add structured data: **tables, checklists, metrics, charts, formulas, dates, links and code**. Several people can work on them at once, and every value is a signed record.

The data comes in two layers:

- **The node** is an ordinary `NODE` record. Its label is the data written in a readable form: a markdown table, a list, `unit: $k`. Search, history, replay, forks, deliveries and exports all keep working, because they only see a node with a label. Only the node's author changes its structure, by signing a new version (`E`).
- **The values** are four new records. Each one names the node's *first* version (`R`), so it survives the author's later edits. Anyone with "draw" may sign them. Each record changes one thing, so two people changing different cells, ticking different items or logging readings never overwrite each other.

Open the **Data** button in the dock (the grid icon), press **D**, or use ⌘K → "Insert …". The canvas home also has a *Project tracker* template built from data nodes.

## The kinds

| Kind | Label (what the author signs) | What others do | On the canvas |
|---|---|---|---|
| **Table** | `Title` then a markdown table; the first column names the rows | Change a cell (double-click, Tab moves on); add a row | Number columns align right and get a total; a dot marks a value someone else set |
| **Checklist** | `Title` then `- [ ] item` lines | Tick an item (one click on its box); add an item | Progress bar and `done/total`; who ticked each item |
| **Metric** | `Title`, `value:`, `unit:`, `target:`, `better: higher\|lower` | Log a new value | Latest value, change since the last one (green when it moves the right way), progress to the target, a sparkline of every reading |
| **Chart** | `Title`, `type: bar\|line\|pie`, `column:`, or `label: number` lines | — (it follows its data) | Connected to a table, metric or checklist (its parent `P`, drawn as a connector), it redraws as cells change and readings arrive |
| **Formula** | `Title`, `= expression`, `unit:`, `decimals:` | — (it follows its data) | The value, or what's wrong, in words; selecting it draws dotted lines from every node it reads |
| **Date** | `Title`, `YYYY-MM-DD [HH:MM]`, a note | — | A calendar leaf that counts down and turns amber three days before; grey once passed |
| **Link** | `Title`, an `http(s)` address, a note | Open it (the *Open ↗* button) | The site's letter and host, so people see where it goes before they click |
| **Code** | an optional title, then a fenced block with the language | Copy it | Line numbers, fixed-width text, light syntax colours |

### Formulas

A formula names other data nodes by their titles, so you can compute across the canvas like a spreadsheet:

| Reference | Means |
|---|---|
| `[Revenue]` | a metric's latest value, or another formula's result |
| `[Beta launch]` | a date: whole days from today (negative once passed) |
| `[Launch checklist]` | a checklist: percent done |
| `[Work.Days]` | a table column: a list of its numbers, for `sum` `avg` `min` `max` `count` |
| `[Pricing.Team.Price]` | one cell: the row named *Team*, column *Price* |

The operators are `+ − * / % ^` and parentheses. The functions are `sum`, `avg`, `min`, `max`, `count`, `round(x, d)` and `abs`. The expression reader is our own; nothing is passed to `eval`.

Errors are reported in plain words: "Nothing here is called “Nope”", "Division by zero", "Use sum() … on a column". If formulas refer to each other in a loop, each one reports "It depends on itself" instead of hanging. A formula's value is never stored. Every peer computes it from the same signed data, so it can't drift.

## Records

| Action | Fields | Rule |
|---|---|---|
| `CELL` | `I R A B M` | `R` is the table's first version; `A` is the row's name, `B` the column's name and `M` the value. The latest `Z` wins per row and column. |
| `TICK` | `I R A S` | `A` is the item's text and `S` is `1` or `0`. The latest `Z` wins per item. |
| `READING` | `I R V M` | `V` is a plain decimal (`-?\d{1,15}(\.\d{1,9})?`) and `M` an optional note. Every reading is kept, in `Z` order. |
| `ROW` | `I R M` | `M` holds tab-separated values: a new table row, or a new checklist item. |

Rows and items are named by their first cell or their text, not by their position. A second row with the same name is `Name#2`. A cell edit therefore still means the same thing after the author adds, removes or reorders rows.

When the author changes a value in the structure form, that change is signed as a `CELL` (or `TICK`) too. Otherwise an older edit by someone else would still win over the new version's text. Rows and items that others added are not copied into the author's text, so a structure edit can never duplicate or drop them.

### Who may do what

- **Structure:** only the node's author. Others who press Enter or double-click get the cell, the item, or a sentence explaining what they can do.
- **Values:** need "draw" on an owned canvas. `signed()` refuses to sign them otherwise, and `derive()` ignores anything signed without it.
- **Locked nodes:** values signed after the lock take no part.
- **Zones:** the four records are gated like any other edit. In someone's *suggest* zone they wait for the owner to accept them; in a *locked* zone they are refused.
- **Malformed records** are refused on ingest. That covers a reading that isn't a plain number (`1e400`, `NaN`, `12abc`), a cell that names no node, and fields past their length limits.
- **Links** only open `http` and `https` addresses. A forged `javascript:` link is drawn as text ("Not a web address") and has no button.
- **Undo:** ⌘Z takes your own value back. A cell or tick is set to what it was; a row or reading is revoked.

## For developers

Each kind is one module in `js/features/data/` that calls `registerDataKind(kind, spec)`. The spec has these parts:

```js
{ name, icon, blurb, label, min: [w, h],
  layout(text) → { w, h, … },          // from the label alone: the layout cache stays valid
  fit?(el, L) → { w, h },              // grow with live data (rows others added)
  draw(box, L, { el, accent }),        // canvas drawing; helpers: dataCard, dataHead, fitText, dataFoot, sparkline
  hit?(el, w, box) → { act, press? },  // press: acts on one click (a checkbox, "+ Add row", "Open ↗")
  press?(el, hit), edit?(el, hit),     // edit: a double-click or Enter on that spot
  form(el | null, { source }) → label | { label, parent } | null,
  describe(el), lines(el), title?(text) }
```

The core needed three small hooks in `render/nodes.js`: a kind may lay itself out, draw itself and grow with live data (`layout`, `draw`, `fit` on `NODE_KINDS`). It also needed one each in `diagrams` (edit routing), `export-svg` (a kind's own SVG), `ledger` (`RECORD_TYPES[t].say`), `chrome` (a kind's own description) and `zones` (`ZONE_TARGETED`).

`features/data/core.js` holds everything kinds share:

- the four records and the derived index (`DATA.cells`, `.ticks`, `.readings`, `.rows`, `.titles`), with merged views memoised per derive;
- the in-place field (`dataField`);
- the Data menu, the D key and the palette entries.

To add a kind, write one module, add its `<script>` after `data/core.js`, and add its id to `DATA_ORDER`.

Tests: `tests/datanodes.mjs` runs two people over WebRTC through the real interface: the Data menu, double-click on a cell, Tab, a click on a checkbox, "Log a value". It also covers concurrent cell edits, undo, structure edits, formulas and loops, dates, unsafe links, forged and malformed records, locks, zones, the activity log and SVG export (36 checks).
