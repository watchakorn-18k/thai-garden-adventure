---
version: alpha
name: Thai Garden Adventure
description: Cozy Thai-dusk pixel-art design system for a Stardew-style farming game. Square corners, layered solid-shadow depth, no blur.
colors:
  primary: "#e8a23a"
  background: "#1a0f1f"
  foreground: "#f4e4c1"
  card: "#2d1b3d"
  secondary: "#4a2f5c"
  muted: "#3a2348"
  muted-foreground: "#b89dd1"
  accent: "#d94e6a"
  border: "#8b6420"
  gold: "#ffd24a"
typography:
  h1:
    fontFamily: Press Start 2P
    fontSize: 34px
    lineHeight: 1.2
    letterSpacing: 2px
  label:
    fontFamily: Press Start 2P
    fontSize: 8px
    letterSpacing: 2px
  button:
    fontFamily: Press Start 2P
    fontSize: 10px
    letterSpacing: 0.5px
  body:
    fontFamily: Mali
    fontSize: 15px
    lineHeight: 1.7
rounded:
  sm: 0px
  md: 0px
  lg: 0px
spacing:
  xs: 6px
  sm: 8px
  md: 10px
  lg: 14px
  xl: 18px
components:
  app:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
  panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    padding: 18px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 10px
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: 10px
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.background}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
  chip:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    padding: 8px
  chip-hint:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
  badge-gold:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.background}"
  frame:
    backgroundColor: "{colors.border}"
    padding: 4px
---

# DESIGN.md — Thai Garden Adventure

A design system file for AI agents and contributors. The YAML front matter holds the machine-readable tokens; the prose below explains **why** they exist and how to apply them. Build/architecture rules live in `CLAUDE.md`.

The product is a Thai-themed, Stardew-style pixel-art farming game. Everything is rendered in CSS — no sprite sheets, no UI-library skin. The aesthetic: **chunky retro pixel art at a Thai dusk** — warm, cozy, hard-edged, with zero rounded corners.

## Overview

- **Mood:** cozy, nostalgic, golden-hour. A Thai village garden at sunset — purple-to-amber sky, fireflies, distant stars.
- **Style:** 8/16-bit pixel art. Hard edges, layered box-shadow "borders," dithered gradients. Everything reads as if drawn on a low-res grid.
- **Density:** medium. The game field is the hero; panels and toolbars frame it without crowding.
- **Philosophy:** no anti-aliasing, no soft corners, no blurred shadows. Depth comes from stacked solid-color shadow steps, not blur. Motion is springy and short (`0.05s`–`0.6s`), never floaty.
- **Global rule:** `image-rendering: pixelated` is applied to every element; `--radius` is `0` everywhere — corners are always square.

### Agent quick start

> Match the existing pixel-art style: square corners, layered solid `box-shadow` depth (no blur), `image-rendering: pixelated`, the `Press Start 2P` pixel font for chrome and `Mali` for prose, short springy animations. Use the tokens defined above (mirrored in `src/styles.css` `:root`) — never raw hex.

## Colors

All UI colors are tokens (front matter) mirrored as CSS variables in `src/styles.css`. Use the token, not the hex.

- **primary `#e8a23a`** — amber. Primary action and the active tool/crop state. Pairs with `background` for text.
- **background `#1a0f1f`** — deep plum-black. The app base **and** the universal pixel "ink": almost every component carries a `0 0 0 2px #1a0f1f` outline. Doubles as dark text on light fills.
- **foreground `#f4e4c1`** — warm parchment. Primary text on dark surfaces.
- **card `#2d1b3d`** — panel / card surface.
- **secondary `#4a2f5c`** — muted purple. Default button / chip surface.
- **muted `#3a2348`** — recessed surface for chips and hints.
- **muted-foreground `#b89dd1`** — lavender. Secondary / hint text.
- **accent `#d94e6a`** — rose. Accent / destructive-leaning action.
- **border `#8b6420`** — antique gold-brown. Outer frame rings (decorative, never a text surface).
- **gold `#ffd24a`** — highlight, focus glow, currency, the "ready" state.

### World palette (art, not UI tokens)

The game world is painted from a separate set of CSS variables — kept out of the token table because they style pixel tiles, not interface chrome:

- **Sky gradient:** `--sky-1 #2a1b4a → --sky-2 #5b2e6b → --sky-3 #c8467a → --sky-4 #f0a05b → --sky-5 #fbd28a`.
- **Grass:** `--grass-1 #6ab04c` · `--grass-2 #4e8c3a` · `--grass-3 #3a6b2a` · `--grass-blade #8bc967` · `--grass-shadow #2a4d1f`.
- **Soil:** `--soil-1 #6b3a1c` · `--soil-2 #5a2f17` · `--soil-3 #422010` · `--soil-highlight #8b5a2b`.
- **Water:** `--water-1 #3a8ec0` · `--water-2 #2a6e9e` · `--water-shine #7fd8ff`.

## Typography

Three families, loaded from Google Fonts in `src/routes/__root.tsx`.

- **Pixel face — `Press Start 2P` (fallback `VT323`, monospace):** headings, buttons, chips, labels, HUD numbers. The "game" voice. Tokens: `h1`, `label`, `button`.
- **Body face — `Mali` (fallback `system-ui`):** body copy, descriptions, Thai-language text. The default `body` font. Token: `body`. Weights `400 / 600 / 700` only.

Hierarchy:

| Role                   | Token    | Notes                                                                         |
| ---------------------- | -------- | ----------------------------------------------------------------------------- |
| Hero / lobby title     | `h1`     | rendered `clamp(18px, 4vw, 34px)`, color `gold`, hard shadow `3px 3px 0` ink. |
| Section label          | `label`  | `gold`, uppercase feel, wide tracking.                                        |
| Button / chip / keycap | `button` | pixel `9–11px`.                                                               |
| Crop name / body       | `body`   | Mali `13–15px`, hard `2px 2px 0` shadow on names.                             |

Rules:

- Pixel text always gets a **hard offset shadow** (`Npx Npx 0 <ink>`), never a blur.
- Never set the pixel face larger than ~18px in body flow, or use it for long paragraphs — it gets unreadable. Use Mali there.

## Layout

- **Spacing scale:** `xs 6 · sm 8 · md 10 · lg 14 · xl 18` (px). Panel padding `16–18px`. Stay on even values — odd padding breaks the pixel rhythm.
- **Grid:** game content is centered with a max width (lobby cards cap at `min(580–780px, 100%)`). The farm toolbar is a `220px | 1fr` grid; the crop grid is 4 columns on desktop.
- **Whitespace:** generous around the hero field, tight inside pixel components — their chunky borders already supply separation.
- **Alignment:** everything snaps to the grid. Prefer `display: grid` with explicit columns over flex-wrap when alignment matters.
- **Z-order:** sky decoration `z-index: 0`, world entities (fireflies) `~15`; keep HUD/overlays above the world.

### Responsive behavior

Mobile-first collapse via media queries in `src/styles.css`:

- **≤ 900px:** farm toolbar → single column; tool grid → 3 cols; crop grid → 2 cols.
- **≤ 767px:** lobby versus grid → single column; `VS` core shrinks and centers; ready row stacks; rule lines hidden; multiplayer guide grids → single column.
- **≤ 520px:** tool grid and crop grid → single column.

Rules: keep interactive pixel buttons ≥ `42px` min-height; titles use `clamp()` so they scale without breaking the grid; decorative-only elements (orbit lines, rule lines) hide rather than reflow; never shrink pixel components below legibility — switch to a single column instead.

## Elevation & Depth

Depth is **faked with stacked solid shadows**, never gaussian blur.

- **Outline first:** every raised element starts with `box-shadow: 0 0 0 2px #1a0f1f` — the pixel "ink" outline.
- **Bevel:** inset highlight on top + inset shadow on bottom — `inset 0 2px 0 0 rgba(255,255,255,.1)` and `inset 0 -3px 0 0 rgba(0,0,0,.35)`.
- **Frames:** stack multiple `0 0 0 Npx <color>` rings in 4px steps for the picture-frame look (`.pixel-frame`, `.field-frame`).
- **Glow (focus/active only):** a single soft amber/gold halo — `0 0 16px rgba(232,162,58,.4)` or `rgba(255,210,74,.5)`. Reserved for active / ready / highlighted states; never decorate idle elements with glow.
- **Surface hierarchy (front → back):** keycap / active button → panel/card → field frame → sky background.

## Shapes

- **Corners are always square.** `rounded.sm/md/lg` are all `0px`; `--radius: 0` globally. Do not introduce `border-radius`.
- **Pixel outline is the shape language.** Form comes from layered solid `box-shadow` rings in the ink color, not from rounding or borders.
- **`image-rendering: pixelated`** is global — keep it so scaled art and gradients stay crisp-stepped.
- Exceptions are tiny art details only (status dots, fireflies use `border-radius: 50%`); interface chrome stays square.

## Components

Reusable classes live in `@layer base` of `src/styles.css`. Prefer them over ad-hoc styling. shadcn/ui primitives exist in `src/components/ui/`, but the game UI is driven by these pixel classes. The `components` tokens above capture each one's color/typography contract.

- **`panel` — `.pixel-panel` / `.pixel-frame` / `.field-frame`:** card surface with a chunky 4-step layered border (inner `card`, outer ink) plus inset bevel. `.field-frame` adds the outer amber glow and wraps the hero play area only.
- **`button-primary` / `button-secondary` / `button-accent` — `.pixel-btn`:** pixel `button` type, double `ink + border` outline, inset bevel. `:hover` pops up (`translateY(-2px)`), `:active` presses in. `[data-active="true"]` → `primary` fill + `gold` ring + amber glow (selected tool/crop); `[data-accent="true"]` → `accent` fill.
- **`chip` / `chip-hint` — `.pixel-chip`:** compact status/value tag on `muted`, single ink outline. Hint text uses `muted-foreground`. `[data-gold="true"]` switches to the gold badge below.
- **`badge-gold`:** `gold` fill + glow with ink text, for highlighted stats and currency.
- **Keycap — `.pixel-key` (+ `-sm`, `-wide`):** parchment-gradient keycap with a `border`-colored underside bevel and hard drop edge; shows keyboard controls.
- **Toolbar — `.farm-toolbar` / `.farm-tool-btn` / `.farm-crop-card`:** two-column game toolbar (tools left, crop grid right). Tool buttons are `icon / label / key-hint` rows; crop cards are `icon / name + buy-sell prices`.
- **Workflow strip — `.flow-strip` / `.flow-step`:** numbered mini-cards (icon + label + Thai sub-label) joined by `.flow-arrow`; `[data-gold="true"]` marks the active step. Explains the plant → water → harvest loop.
- **Game menu — `.header-level-btn` / `.game-menu-*`:** level-like HUD trigger opens the player dialog. Dialog groups outfit, crop index, controls, and settings inside one square pixel panel with tab buttons and internal scrolling.
- **Lobby — `.lobby-*`:** multiplayer staging — animated title card, versus grid with a breathing `VS` core, per-player cards (sprite, status dot, ready state), and a ready row. All entrance-animated.

## Do's and Don'ts

**Do**

- Use the defined tokens and the `.pixel-*` / `.farm-*` / `.flow-*` / `.lobby-*` classes.
- Keep corners square and build depth from layered solid `box-shadow` steps.
- Use the pixel face for game/UI chrome and Mali for prose and Thai text.
- Animate with short, springy easings (`cubic-bezier(.2,.85,.2,1)`, `cubic-bezier(.16,1,.3,1)`), durations `0.05–0.6s`.
- Keep `image-rendering: pixelated` intact.

**Don't**

- ❌ Add `border-radius` or blurred shadows for depth.
- ❌ Use smooth/long transitions, parallax drift, or material-design elevation.
- ❌ Set the pixel face above ~18px in body text, or use it for long paragraphs.
- ❌ Introduce new raw hex values — add a token instead.
- ❌ Use gradients outside the established sky / keycap / tile patterns.
- ❌ Put glow on idle elements (reserve gold glow for active / ready / highlight).
- ❌ Re-skin with a generic shadcn look that fights the pixel art.

---

_Tokens mirror `src/styles.css` `:root`. When this file and the CSS disagree, the CSS is the source of truth — update this doc to match._
