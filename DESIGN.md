---
name: Evidient
description: Basel pharma plate. Evidence for drug and alcohol interactions, printed like a Swiss pharmaceutical brochure.
colors:
  paper: "#F4F5F2"
  paper-deep: "#E8EAE6"
  ink: "#111311"
  ink-soft: "#454944"
  ink-faint: "#6E736C"
  rule-faint: "#C9CCC6"
  recede: "#B9BDB6"
  focus: "#1F3FBF"
  field-cns: "#1F3FBF"
  field-bleeding: "#D62F1F"
  field-liver: "#F0B000"
  field-serotonin: "#B3166E"
  field-reaction: "#0B7D57"
  field-efficacy: "#5B5F59"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "72px"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-2.4px"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-1.2px"
  lead:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "-0.3px"
  heading:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.375
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  small:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
  meta:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.33
  tag:
    fontFamily: "Archivo Narrow, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.33
    letterSpacing: "0.4px"
rounded:
  none: "0px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
  "8": "64px"
  grid: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "44px"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "16px"
  chip-substance:
    backgroundColor: "{colors.paper-deep}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "44px"
  input-add:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "44px"
  panel-field:
    backgroundColor: "{colors.field-reaction}"
    textColor: "{colors.paper}"
    padding: "24px"
  quote-plate:
    backgroundColor: "{colors.paper-deep}"
    textColor: "{colors.ink}"
    padding: "12px"
---

# Design System: Evidient

## Overview

Evidient is a **Basel pharma plate**: 1950s–70s Swiss pharmaceutical graphics (the Geigy house style) used as an interface. Pages are cool printed stock with black ink rules. Flat, saturated color fields carry meaning, geometric marks replace pictures, and one grotesk family is set on a strict size ladder. The interaction map *is* the page. The design refuses both the clinical blue-card health app and the neon "AI graph".

Mode: **Operate.** The visitor reads evidence and inspects it. Expression lives in precise details (line form, color fields, catalog numbers) and never obscures the task.

Implementation: `ui/theme.ts` (tokens), `ui/components/*`, `ui/graph/*`, `ui/webGlobals.ts` (browser surfaces).

## Colors

Strategy: **restrained neutrals plus one warm warning ramp.** The ground is neutral. Colour appears only for the warning level: one field per result page, a 4px rule over each level group in lists, the meter bars and the map lines. Everything else is ink.

### Neutral
- **Paper** `#F4F5F2`: cool printed stock. Not cream.
- **Paper deep** `#E8EAE6`: recessed plates (quote blocks, chips, hover and pressed states).
- **Ink** `#111311`: text, rules, marks, primary buttons.
- **Ink soft** `#454944` (8.6:1) and **ink faint** `#6E736C` (4.7:1): secondary and tertiary text.
- **Rule faint** `#C9CCC6`: hairlines and registration marks. **Recede** `#B9BDB6`: graph matter behind a focused edge.

### Warning level is the only colour in lists and pages
**Warm, never green.** Used for the result-page field, level-group rules, meter bars and map lines:
- Serious warning on the label: field `#C42318`, mark `#C42318`
- Label advises against combining: field `#E26A12` with ink text, mark `#B85200`
- Label mentions an interaction: field `#EDB817` with ink text, mark `#9A7200`
- Reported in studies only: field `#5B5F59`, mark `#6E736C`

No warning-level colour may read as "safe", so the ramp has no green. "Nothing documented" and "not reviewed" stay uncoloured. On dark stock the marks brighten (`#FF6B5E`, `#FF9A45`, `#F2C94C`, `#9DA29A`). Marks are at least 3:1 against the ground, and the bar count and level text always repeat the meaning.

**Kind of harm: text, not colour.** The kind of harm is a narrow uppercase tag in ink faint (lists) or a line under the level (result page), so a row carries one colour signal at most. Map lines also use the warning ramp. The cool, earthy hues below stay in `ui/theme.ts` but no screen uses them now:
- CNS depression `#1F3FBF`
- Serotonin `#6E3FC2`
- Bleeding `#0E7480`
- Liver `#56632A`
- Reaction `#2F4858`
- Effect change `#5B5F59`
- Other effects: ink

Text on every field is white. Red, orange and amber are never used for a kind of harm.

### Dark mode: the plate printed in reverse
The same system, printed with bone ink (`#E9EBE6`) on near-black stock (`#121412`):
- **Text:** soft `#B3B8B0`, faint `#8B9188`.
- **Focus:** `#8EA2FF`.
- **Colour fields** keep their light-mode values. "Other effects" inverts to bone with ink text.
- **Lines on the plate** use brighter cuts so strokes stay legible: CNS `#6F86F2`, Bleeding `#F06A5C`, Serotonin `#E0569F`, Reaction `#2BB585`, Effect change `#9DA29A`.

The theme follows the system by default. The header toggle cycles system → dark → light, stores the choice on the device, and reloads the page, because styles are created when modules load (`ui/theme.ts`).

### Named Rules
- **Warm means warning level, cool means kind of harm.** The two systems never share a hue. There is no green good/bad pair, and nothing is coloured "safe".
- **Never color alone.** Category is always named in text too. Evidence depth is carried by line form.
- **Focus blue** `#1F3FBF` is the one interactive accent: focus rings, caret, selection tint (18%), and the open quote key.

## Typography

One family: **Archivo**, with **Archivo Narrow** for compact catalog tags. The ladder is strict, 12 / 14 / 16 / 20 / 28 / 44 / 72 px, and nothing falls outside it. 28 is used only for the warning-level statement.

### Hierarchy
- **Display 72/700, −2.4px.** Only the first-screen question.
- **Title 44/700, −1.2px.** The pair name in the evidence field ("Metronidazole × Alcohol"), set on two lines.
- **Lead 20/500.** The card headline and the first-screen lede.
- **Heading 16/700.** Section titles, pair names in the index, and source citations.
- **Body 16/400, 24px leading.** Claims and sentences.
- **Small 14 / Meta 12.** Metadata, limits, searched queries, disclaimer.
- **Tag (Narrow 12/700, +0.4px).** Graph edge labels, quote keys, audit-trail event names, and source design badges. Never as a label above a heading.

### Named Rules
- **Metadata goes under the name.** The catalog number and category sit beneath the heading they describe, never above it as an eyebrow.
- **Tabular numerals** for timings and counts (`font-variant-numeric: tabular-nums`).

## Layout

- **Wide (≥960px):** a 2px ink rule under the header holds the wordmark, substance chips, add field and Scan button. Below it are three columns: catalog index (300px, hidden at <1320px while a card is open), the plate (fluid), and the evidence panel (480px, 2px ink rule on its left).
- **Narrow:** stacked. The header shows the wordmark and a scan icon button, then wrapping chips, then a full-width add field. The plate (380px tall) sits above the legend and the index. The evidence panel becomes a full-height sheet.
- **The plate registers to a 24px grid.** Node positions come from a seeded d3-force layout and are snapped to the grid, so the same substances always produce the same plate. Corner registration marks frame it like a print sheet.
- **Spacing ladder:** 4/8/12/16/24/32/48/64. There is more space above a section rule than below its title.

## Elevation & Depth

Flat by default: printed matter has no shadows. The only shadow is on the search results menu (offset 8, blur 18, 14% black), because it physically floats over the plate. Depth on the plate comes from the **veil**: a paper wash at 82% that pushes unrelated matter back when an edge is focused.

## Shapes

- **Square corners everywhere** (`rounded.none`): buttons, chips, fields, panels, badges.
- **Marks:** a filled disc for prescription, a 4px ring for over-the-counter, a filled square for alcohol.
- **Rules:** 2px ink for structure (header, section openers, outlined buttons), hairline for list separators.

## Components

### Warning level (signal)
At the top of every combination: a meter of three printed ink bars, then a 28px bold statement of what the label says:
- ▮▮▮ Serious warning on the label;
- ▮▮▯ Label advises against combining;
- ▮▯▯ Label mentions an interaction;
- ▯▯▯ Reported in studies only, or Nothing documented in our sources.

Below that come the conflict note, the lead headline, and a "Why this level" quote. The level is derived deterministically from accepted label claims (`shared/contract.ts`, `ui/signal.ts`). It is never a safety verdict, and it uses ink only, never colour. Lists (`ComboList`) repeat the meter at small size.

### Home
The home screen has, in order:
- a 60px add field and Scan button;
- recent checks (stored only on this device);
- two columns, "With alcohol" and "Medicine with medicine", sorted by warning level.

One substance opens its own page with "What are you combining X with?". Two substances open the evidence card as a centred 720px page. Three or more open the map.

### Harm fields
A row of colour fields, one per harm type, each 104px tall. Each field shows a 44px count of documented combinations and the harm name in the field's on-colour. Tapping a field filters the home lists and dims the other fields to 28%. This is the home screen's one large use of colour.

### Line form (signature)
Evidence depth is drawn with the same grammar on the plate, in the legend, in the index, and in the panel:
- **Solid:** human studies.
- **Dashed:** label only.
- **Round-dotted:** limited (case reports, mechanism, animal).
- **Doubled:** sources disagree.
- **Faint hairline:** not yet assessed.

Each line is stroked in its warning level's mark colour (faint grey until the card loads). See `ui/components/LineFormSample.tsx` and `ui/graph/InteractionGraph.tsx`.

### Evidence panel
A full-bleed category field holds the title (44px, two lines) and below it `EV-nn · Category`. Under the field: a line-form row, the lead headline, then sections that open with a 2px ink rule:
- what has been reported;
- proposed mechanism;
- where sources disagree (two halves split by a doubled vertical rule);
- kind of evidence (outlined design badge, citation link, participants, limits);
- looked for, not found;
- questions for a pharmacist (ink-square bullets);
- an outlined "How this card was built" button, then the disclaimer.

### Quote keys
Each sentence ends with numbered ink keys (Narrow 11, ink background). Opening a key reveals a paper-deep **quote plate** with the verbatim quote, the source link, and "Quote matched · Support checked". The open key turns focus blue.

### Audit trail
A 1px vertical rail. Event ticks use line form:
- full tick: an action or accepted step;
- half tick: a result or status;
- double tick: parallel tool calls;
- struck tick: a rejection.

Below the rail, a claim ledger marks each claim as **kept** (solid bar) or **rejected** (struck text with the reason). Planted test claims carry an ink "PLANTED TEST CLAIM" badge. The live bar has a primary ink "Run the agent live" button, which turns vermilion while running, and a square checkbox for planting false claims.

### Buttons, chips, inputs
- **Primary buttons:** ink with paper text, 44px tall, square.
- **Outline buttons:** a 1.5–2px ink border.
- **Substance chips:** paper-deep, with a 36×44 remove target.
- **Add field:** a 2px ink border that turns focus blue while focused; its menu takes a 2px ink border and the single floating shadow.

### Motion
The **registration moment** is the only authored motion. When an edge is selected, the veil fades in and the panel slides in from 32px (48px vertically on phones). Both use 320ms with an exponential ease-out. Everything is visible by default, and reduced motion zeroes the durations.

## Do's and Don'ts

### Do:
- Back every sentence with a quote key. If no accepted claim cites it, it does not render.
- Name categories and evidence depth in words wherever they appear as color or line.
- Keep colour fields at field scale (panel headers, edges). Never use them as decorative accents.
- State absence plainly: "No interaction found in the labels and studies Evidient covers. That is not proof there is no risk."

### Don't:
- Don't put labels or eyebrows above headings. Metadata goes underneath.
- Don't use the words "safe", "should", "recommend", or "verified" on its own in interface copy.
- Don't round corners, add drop shadows to panels, or use gradients or glass.
- Don't encode severity or reassurance with color (no green "OK" states).
- Don't add a second typeface or step off the size ladder.
