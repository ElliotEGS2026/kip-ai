---
name: Kip
description: A red sci-fi HUD morning briefing, walked one item at a time, with Kip the plush drifting behind the glass.
colors:
  void: "#080405"
  card: "rgba(26,12,13,.82)"
  line: "#3a1c1d"
  text: "#f6ecea"
  text-soft: "#e2d3d1"
  muted: "#b09794"
  red: "#e5262b"
  red-bright: "#ff5a5f"
  amber: "#ffb020"
  green: "#5dd39e"
typography:
  body:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  slide-title:
    fontFamily: "Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1.5rem, 3.2vw, 2.1rem)"
    fontWeight: 500
    lineHeight: 1.3
  label:
    fontFamily: "Consolas, 'Courier New', monospace"
    fontSize: "0.75rem"
    letterSpacing: "0.3em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "12px"
  pill: "999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "28px"
components:
  button-primary:
    backgroundColor: "{colors.red}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
---

# Design System: Kip

## Overview

**Creative North Star: "The Morning Console"** *(inferred from the existing UI and PRODUCT.md; not confirmed with the owner)*

Kip is a private cockpit for the first ten minutes of the day: a dark void, a red reactor core in the middle, and one glass panel at a time carrying a single item. It is calm and deliberate rather than dense. The red is the instrument light, and Kip the plush floating behind the glass is the one playful note.

The system is Operate-mode: scanability and predictability outrank expression. Glow and motion are part of the identity but never carry information on their own.

**Key Characteristics:**
- Near-black warm background, one saturated red accent, amber reserved for warnings.
- One item per screen, centred, generous type; a progress ring and numbered pips show where you are.
- Glow, rings and a particle field give atmosphere; the Kip mascots live on a background layer and never cover the interface.
- Binding commitments: keep the red theme and the Kip mascot (see PRODUCT.md).

## Colors

A warm black with one red voice. Everything else is a tint of that red or a warm neutral.

### Primary
- **Reactor Red** (#e5262b): primary buttons, the active pip, the ring arcs, borders of focus. White text on it is 4.5:1, the minimum, so keep its text at body size or larger.
- **Signal Red** (#ff5a5f): links, times, numbers and labels on dark surfaces.

### Secondary
- **Warning Amber** (#ffb020): warnings, security tags, priority stars, the "leave notes" popup title and delete buttons.
- **Fresh Green** (#5dd39e): the single "new" tag on fresh items.

### Neutral
- **Void** (#080405): page background, under a faint red radial glow.
- **Glass** (rgba(26,12,13,.82)): panels and orbs.
- **Hairline** (#3a1c1d): every divider and resting border.
- **Ink** (#f6ecea), **Soft Ink** (#e2d3d1), **Muted** (#b09794): primary, running and secondary text.

### Named Rules
**The One Voice Rule.** Red is the only chromatic accent. Amber means "needs attention", green means "new"; neither decorates.

## Typography

**Body and display:** Segoe UI (system-ui fallback). **Labels, clock, pips:** Consolas monospace, for data and counters only.

**Character:** plain and legible, letting spaced capitals and monospace counters supply the instrument-panel feel.

### Hierarchy
- **Slide title** (500, clamp 1.5-2.1rem, 1.3): the one headline per slide, balanced.
- **Summary** (400, 1.2rem, 1.65): the lead sentence of an item.
- **Body** (400, 1rem, 1.5): list items, notes.
- **Label** (monospace, 0.75rem, 0.3em tracking, uppercase): section tags, counters. Nothing functional goes below 11px.

**Type scale (rem):** .75 · .85 · .95 · 1 · 1.1 · 1.2 · 1.4 · 1.6, plus display sizes for icons and the slide title. New text snaps to one of these.

### Named Rules
**The 11px Floor Rule.** No interactive or informative text under 11px.

## Layout

A fixed three-part stage: header (brand left, progress pips true-centre, clock and controls right), a centre stage, and at most one panel (max 940px, centred) with a header, a scrolling body and a fixed footer holding Back and Next. Short slides are vertically centred with auto margins; tall slides start at the top and scroll inside the panel body, so nothing is unreachable. Below 820px the page itself scrolls and the panel flows in the page; below 480px the header and panel tighten. It has been checked at 320, 390, 820, 1280x600, 1366, 1920 and 2560x720.

## Elevation & Depth

Depth is light, not shadow: a hairline border, a 1px bright top edge on the panel, a soft dark drop, and a red glow around active elements. Glass panels use an 8px backdrop blur over the particle field.

### Shadow Vocabulary
- **Panel** (`box-shadow: inset 0 1px 0 rgba(255,90,95,.55), 0 0 50px rgba(0,0,0,.6), 0 0 28px rgba(229,38,43,.18)`): the single reading surface.
- **Hover glow** (`box-shadow: 0 0 14px var(--glow)`): buttons and orbs on hover.

### Named Rules
**The Glow Is Mood Rule.** Glow is atmosphere (accepted by the owner as part of the look). Anything that must be read must also work without it.

## Shapes

Radius scale: 4px chips and pips, 6px controls, 12px panels and popups, pill and circle for the core and orbs. Rounded rectangles, circles for the core and orbs, 4px chips and pips. Borders are 1px; no thick accent stripes.

## Components

### Buttons
- **Shape:** 6px radius.
- **Primary:** Reactor Red fill, white text; footer buttons are larger (12px 28px, 1.1rem).
- **Ghost:** transparent with a Hairline border; **Danger:** transparent with a red border and Signal Red text.
- **Hover / Focus:** red glow on hover; a 2px Signal Red outline with 2px offset on keyboard focus (buttons, links, tick boxes).

### Pips
Monospace chips, 28px minimum height (36px on phones): muted at rest, red border when seen, red fill and glow when current. Each carries an accessible name and `aria-current`.

### Core and orbs
An SVG reactor with three rings and a progress arc. At the end the sections spread into orbs around it with their counts; error orbs are amber, unconfigured orbs dashed. Orb labels use a short name when the section title is long ("Notes", "Meetings"), and on phones an orb shows its count and name only, so every word stays inside its circle (the layout audit checks this).

On the summary screen the core splits down the middle with a fading red hairline: the left half (eye icon) opens your notes, the right half (note-plus icon) opens "Add a new note". Each half is its own button; hovering lights a soft red glow from the divider outwards. When the core is too small for words (phones), the halves show icons only and keep their labels for screen readers.

### News feedback
Work and world items carry three outlined buttons: More like this, Block source, Block topic. Block topic opens an inline picker (not a modal) under them: pill chips suggested from the headline (names first, e.g. "rachel reeves"), a text box for your own word, and Block topic / Cancel. It keeps the outlet and writes the word to `## Topics` in `config/blocklist.md`; headlines containing it as a whole word or phrase are dropped from the next brief. Escape or Cancel closes it without saving.

### Note composer
A textarea with Speak inside it, then a row with a live status line and a primary "Save note" button (also Ctrl+Enter). Saving clears the box and focuses it for the next note, and the status line counts how many notes you've saved. Anything left in the box is still saved when you leave the page.

### Panel and popup
The panel is the only reading surface. The "notes aren't completed" popup (shown once per walkthrough, never in a panel reopened from the summary, and again after Replay) sits inside it, scrolls on short screens, focuses its safe option first, and owns Escape and the arrow keys while open.

### Icons
Monochrome line SVGs (`Icon.tsx`) in Signal Red replace emoji, with a soft glow at large sizes. Only the ⭐ priority star remains as text.

### Tags and callouts
Small uppercase outlined chips (red for major/breaking, amber for security/priority, green for new). Source problems show as an amber bordered callout with a flag.

### Kips
Plush images floating on a background layer, bouncing off the interface and each other; they hold still under reduced motion.

## Do's and Don'ts

### Do
- Keep one item per screen and let long content scroll inside the panel body.
- Use Reactor Red sparingly for actions and the current position; amber for warnings only.
- Keep keyboard use (arrows, Enter, Escape) working and focus visible.
- Respect reduced motion: stop looping animation, keep a short fade.

### Don't
- Don't add thick coloured side or top borders, gradient text, or nested cards.
- Don't put functional text below 11px or rely on glow to show meaning.
- Don't cover the interface with Kips; they stay behind.
- Don't change the red theme or remove Kip without asking.
