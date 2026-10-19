# Flux Canvas — design system

The interface follows one rule: **the canvas is the product; the chrome floats over it and only shows what you can use now.**

## Layout

```
┌ ☰ Title  [5 votes left] ┐   ┌ ▸ ✋ │ ✎ ⌫ │ ▢ ◯ ↗ │ ▨ ⧉ T 🖼 │ 💬 ┐   (AN)(BE) ┌ 💬 🔍 🛡 ┐ [Share]
                                └── tool hint, for a few seconds ──┘
                                                                     ┌ side panel ┐  comments,
                         the canvas (dot grid)                       │            │  ledger,
                                                                     │            │  audit
┌ − 100% + ⤢ 🗺 ┐          ┌ Colour ●●●●  │ Stroke ──●── │ Fill ┐   └────────────┘
  zoom, overview             style bar: only what the tool/selection can use
```

- **Top left:** canvas menu and title. Vote and timer chips appear only while they're in use.
- **Top centre: the tool dock.** Select (V), Hand (Space), Draw (P), Eraser (E); Rectangle, Ellipse, Line; Sticky note, Shapes and cards (N), Text (T), Image (I); Comment (M).
- **Top right:**
  - **Live chip:** appears while connected to a relay. It shows "Live · 3", or "Reconnecting…" with a pulsing dot.
  - **People on the canvas:** up to four avatars with initials; yours has an accent ring. Click one to see only their work. With more than four people, a "+N" opens People and permissions.
  - **Icon buttons:** comments, outline (⇧O), search and commands (⌘K), signatures.
  - **Share:** people and permissions, going live over a relay, export, summary, audit report, present, history, ledger, import, theme, grid and shortcuts.
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
- **Selection toolbar:** floats above the selection with icon actions: edit, comment, duplicate, align, layer order, lock, group, vote, react, details, delete.
- **Side panels** (comments, outline, ledger, audit) open below the top bar, so it stays usable.
- **Context menu:** right-click an element (or press the Menu key or Shift+F10) for edit, comment, duplicate, copy, layer order, lock, group and delete. On empty paper it offers paste, a sticky note or text right there, select all, fit and the outline. A right-drag still pans.
- **People and permissions:** a table with one row per person and a column per permission: draw and write; comment, vote and react; move others' work; audit and sign off. "Everyone else" sets the default. Only the owner can change it. Each change is a signed `GRANT`.
- **Outline:** the canvas as a tree. Frames hold what sits inside them, in reading order. Each entry lists its connections and their meaning, votes and comments. Enter shows an element on the canvas.

**Medium widths (641–1100 px):** the dock moves to the left edge, vertically, and zoom moves to the bottom right.
**Phones (≤ 640 px):** the dock runs along the bottom and scrolls sideways, with a fade on the edge that shows there is more. Hand is hidden because two fingers pan. The style bar sits above the dock. Zoom is by pinch; the overview, search and signature buttons go into the menus. Comment cards show on demand, so pins don't cover the notes.

## Tools behave like tools

- A shape tool (Rectangle, Ellipse, Line) hands back to **Select** after one shape, with the new shape selected. That keeps the selection toolbar and style bar at hand.
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
- `#menu`: `openMenu(anchor, items)` builds a menu; `'-'` is a separator. Each item is `{ label, icon, key, run }`.

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
