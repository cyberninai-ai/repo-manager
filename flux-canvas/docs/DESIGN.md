# Flux Canvas — design system

The interface follows one rule: **the canvas is the product; the chrome floats over it and only shows what you can use now.**

## Layout

```
┌ ☰ Title  [5 votes left] ┐   ┌ ▸ ✋ │ ✎ ⌫ │ ▨ ⧉ ↗ T 🖼 │ 💬 ┐   (AN)(BE) ┌ 💬 ⋯ ┐ [Share]
                                └── tool hint, for a few seconds ──┘
                                                                     ┌ side panel ┐  comments,
                         the canvas (dot grid)                       │            │  ledger,
                                                                     │            │  audit
┌ − 100% + ⤢ 🗺 ┐          ┌ Colour ●●●●  │ Stroke ──●── │ Fill ┐   └────────────┘
  zoom, overview             style bar: only what the tool/selection can use
```

- **Top left:** canvas menu and title. Vote and timer chips appear only while they're in use.
- **Top centre: the tool dock** has nine tools. Select (V, the default), Hand (Space); Draw (P), Eraser (E); Sticky note, Shape (N: drag to size or click and type, kind below), Connector line, Text (T), Image (I); Comment (M).
- **Top right:**
  - **Live button:** always visible. It reads "Just you", "Live · 3" or "Syncing · 3" and opens the session panel: you and your name, people here (Follow, Bring everyone to my view), invite link, peer-to-peer codes and the relay.
  - **Work button:** opens the Work panel: tasks by status and deliveries with their approvals. The badge counts open tasks.
  - **People on the canvas:** up to four avatars with initials; yours has an accent ring. Click one to see only their work. With more than four people, a "+N" opens People and permissions.
  - **Comments** (with the open count) and **More** (⋯): search and commands, outline, present, history, summary, audit report, activity log, open a file, theme, grid and shortcuts.
  - **Share:** copy link, people and permissions, go live, download the canvas, export SVG.
- **Bottom centre: the style bar.** It is contextual:

  | Tool or selection | Groups shown |
  |---|---|
  | Draw, Line | Colour, stroke |
  | Rectangle, Ellipse | Colour, stroke, fill |
  | Text, or typing | Colour, text size, font |
  | Sticky note | Colour |
  | Shapes and cards | Shape kind, colour |
  | Your own selection | Whatever it can be restyled with |
  | Select (nothing selected), Hand, Eraser, Comment | Hidden |

- **Bottom left:** zoom out, zoom level (click for 100%), zoom in, fit, overview map (off by default).
- **Selection toolbar:** only what people reach for every time. That is edit, comment, vote and react (on notes), what a connection means (on connectors), align (on several), duplicate and delete. Everything else sits under **More**, in words: layer order, lock, group, copy, arrange in a grid, sort by votes, cluster, masonry, palette, line shape and style, and details. Style lives in the bottom bar; the toolbar is for actions.
- **Side panels** (comments, outline, ledger, audit) open below the top bar, so it stays usable.
- **Context menu:** right-click an element (or press the Menu key or Shift+F10) for edit, comment, duplicate, copy, layer order, lock, group and delete. On empty paper it offers paste, a sticky note or text right there, select all, fit and the outline. A right-drag still pans.
- **People and permissions:** a table with one row per person and a column per permission: draw and write; comment, vote and react; move others' work; audit and sign off. "Everyone else" sets the default. Only the owner can change it. Each change is a signed `GRANT`.
- **Outline:** the canvas as a tree. Frames hold what sits inside them, in reading order. Each entry lists its connections and their meaning, votes and comments. Enter shows an element on the canvas.

**Medium widths (641–1100 px):** the dock moves to the left edge, vertically, and zoom moves to the bottom right.
**Phones (≤ 640 px):** the dock runs along the bottom and scrolls sideways, with a fade on the edge that shows there is more. Hand is hidden because two fingers pan. The style bar sits above the dock. Zoom is by pinch; the overview, search and signature buttons go into the menus. Comment cards show on demand, so pins don't cover the notes.

## Tools behave like tools

- **Select is the default**, so clicking around never leaves marks. `?tool=pen` opens with Draw (e.g. for a drawing kiosk).
- The Shape and Line tools hand back to **Select** after one shape, with the new shape selected.
- A tool's hint shows the first two times you pick it, for under three seconds, and never when the app switches tools for you.
- The `+` handles on a selected node appear only when the pointer comes near it.
- Sticky notes are picked in paper colours (the classic yellow first), not ink colours.
- A line dragged from one element to another becomes a **bound connector** (an `ARROW` record by CID). Anywhere else, it is a straight 2-point stroke. Shift snaps to 45°.
- The modifiers still work from Draw: Shift-drag for a rectangle, Alt-drag for an ellipse, and dragging from an element's edge for a connector.
- Esc leaves the shape and hand tools. Space-drag pans with any tool.

## Tokens (`css/00-tokens.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#f5f4f0` | `#141519` | Canvas background (warm, low glare) |
| `--panel` / `--panel2` | `#fff` / `#f7f7f5` | `#1e1f24` / `#24262c` | Floating surfaces, insets |
| `--ink` / `--muted` | `#1d2129` / `#646a76` | `#e7e8ec` / `#a0a4ae` | Text; muted text keeps 4.5:1 on panels |
| `--line` / `--line2` / `--dot` | `#e4e2dc` / `#eeede8` / `#d4d1c8` | … | Borders, dividers, grid dots |
| `--cyan` (accent) | `#5b54e8` | `#8d88ff` | Active tool, selection, focus ring. The name is historical; canvas code reads it |
| `--accent-weak` / `--accent-line` | `#eceafd` / `#c9c5fa` | `#2c2b4d` / `#4a4790` | Pressed states, selected rows |
| `--green` `--amber` `--red` `--magenta` | AA on white | AA on dark panels | Status: signed or live, comments, errors, arrows |
| `--r-sm` `--r` `--r-lg` | 6 / 10 / 14 px | | Radii: controls, buttons, surfaces |
| `--shadow` / `--shadow-lg` | | | Floating chrome / dialogs, menus, panels |
| `--font-ui` / `--font-mono` | Inter → system UI / system mono | | UI text / records, keys, code |

## Components (`css/01-base.css`)

- `.ic`: one SVG icon from the sprite in `index.html` (24px grid, 1.75px stroke, `currentColor`). `ic('name')` in JS. 81 icons. `face(x)` falls back to a glyph for anything that is not a sprite name.
- `.ibtn`: a 36px icon button (`.sm` is 30px). The pressed or expanded state uses the accent tint. In the dock, the active tool is solid accent.
- `.btn` (`.primary`, `.danger`): text buttons, 32px.
- `.chip`: compact status buttons (votes, timer).
- `.link`, `kbd`.
- `#tip`: a tooltip with label and shortcut. It's taken from `aria-label` ("Name (key)") or `data-tip` plus `data-key`. Hover delay is 420 ms; keyboard focus shows it after 250 ms.
- `#menu`: `openMenu(anchor, items, at, cls)` builds a menu. `'-'` is a separator and `{ head }` is a group title. Each item is `{ label, icon, key, run }`, plus an optional `sub` (a quieter second line) and `tone` (a class). `cls` styles the whole menu: `hub` lays the Team menu out as two columns of tiles, with **Needs you** as a highlighted band on top.

## Team surfaces (`css/12-team.css`)

- **Panels** (`registerPanel`): a header with the feature's icon in an accent tile, a title, and a one-line blurb. On open, focus goes to the panel itself, not to a button, so nothing shows a focus ring until you press Tab. The Work panel follows the same rules.
- **Session bar** (`#strip`): one segmented pill under the title bar, with one segment per running thing (silent round, agenda item, ritual). Timers sit in tabular figures on a tinted chip, and an overrun turns red. On phones the bar scrolls sideways and keeps only the name, the time and the buttons.
- **Canvas badges** (`placeBadge(el, 'top' | 'bottom', text, tone, run)`): features stack small pills in a row above or below an element instead of drawing their own shapes. Tones come from `TONE`, which follows the theme. The critical path is an accent bar under each step and a "◆ Critical path" badge, not red boxes.
- **Form dialog** (`formDialog`): fields can be `half` (two share a row) and grouped under a `{ type: 'section' }` heading. The Deliver dialog uses this for *Approval* and *Payment*.
- **Delivery cards**: `dlField(label, html)` gives one labelled line per part: Approvals, Flow, Shares, Payment, Witnesses. A feature adding to a delivery returns one of these from `DELIVERY_HOOKS.row`.
- **Segmented control** (`.seg`): one choice among a few, each with its count. It is used for the stances on a decision, and secondary actions sit below it as quiet links.
- **Next up** (Work panel): what can start now, and the critical path drawn as a chain of steps.

## Canvas rendering

- **Dot grid:** one dot per 24 world units, doubling the spacing as you zoom out so it never turns to noise. Toggle it from Share or ⌘K; the choice is remembered.
- **Selection:** a solid accent outline with rounded corners, 3px outside the element. A multi-selection adds a dashed group box. The resize handle is a white rounded square with an accent stroke.
- **Hover target** for a connector: a faint accent outline.

## Accessibility

- Every icon button has an accessible name. Tooltips are `aria-hidden` and repeat that name.
- The dock is a `toolbar` of toggles. Changing tool announces its name and hint.
- The style bar's colour, shape and font groups are radio groups that move with the arrow keys.
- The Share menu is a real `menu`: arrows, Home/End, Esc, and focus returns to Share.
- Contrast: muted text, avatar initials, tags and status colours pass WCAG AA. axe-core runs in every suite.
- Reduced motion turns off every transition.

## Language

People see what happened, never how it is stored. Messages say "Deleted 2 · ⌘Z undoes", not "2 revoked with -N-1". Nothing visible mentions signatures, records, CIDs or blobs, except the activity log and the details view, which exist to show them. Every element is still signed and verifiable; that's the product's guarantee, not its vocabulary.
