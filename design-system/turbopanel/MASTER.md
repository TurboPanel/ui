# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/turbopanel/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** TurboPanel  
**Generated:** 2026-07-19 (curated from ui-ux-pro-max + existing `src/lib/theme.ts`)  
**Category:** Developer Tool / DevOps Control Plane (B2B SaaS)  
**Stack:** Expo 56 · React Native · Tamagui · Expo Router · React Query · gifted-charts  
**Design Dials:** Variance 4/10 (Balanced) | Motion 4/10 (Standard) | Density 8/10 (Dense / Dashboard)

---

## North Star

TurboPanel is a **dark-first ops console** — deep OLED blacks, one electric green for "live / go", dense scannable tables, zero decorative fluff. Speed is the brand; the UI should feel like a precise instrument, not a marketing site.

**Style blend:** Dark Mode (OLED) + Soft UI Evolution (subtle elevation) — not cyberpunk neon, not light SaaS purple.

---

## Global Rules

### Color Palette

Canonical tokens live in `src/lib/theme.ts`. Design system maps onto those — do not invent parallel hex values in components.

| Role | Hex | Token / Notes |
|------|-----|---------------|
| Background (deep) | `#000000` | `colors.bg` — true OLED black |
| Panel / sidebar | `#0a0a0a` | `colors.bgPanel` / `bgSidebar` |
| Elevated surface | `#111111` | `colors.bgInput` |
| Secondary surface | `#1a1a1a` | `colors.bgSecondary` |
| Active / selected | `#10241a` | `colors.bgActive` — green-tinted |
| Border | `#222222` | `colors.border` |
| Border muted | `#2a2a2a` | `colors.borderMuted` |
| Text primary | `#ffffff` | `colors.text` |
| Text body | `#cccccc` | `colors.textBody` |
| Text muted | `#888888` | `colors.textMuted` |
| Accent / CTA / online | `#3dd68c` | `colors.accent` — "run green" |
| Pending / warn | `#e0b341` | `colors.pending` |
| Error | `#ff6b6b` | `colors.error` |
| Info / command | `#9ad2ff` | `colors.command` |
| Overlay | `rgba(0,0,0,0.6)` | `colors.overlay` |

**Color notes:** Code dark + run green. Status must never rely on color alone (pair with label/dot shape). Accent hover softens to ~90% opacity; do not shift hue toward blue/purple.

### Typography

| Role | Font | Notes |
|------|------|-------|
| UI / headings / body | Inter (current `@tamagui/font-inter`) | Keep Inter for continuity with Tamagui load path |
| Optional display upgrade | Plus Jakarta Sans | Only if we deliberately migrate away from Inter |
| Metrics / IDs / install cmds / code | System mono → JetBrains Mono or Fira Code when added | Monospace for hostname, UUIDs, curl install lines, chart axes |

- Base size ≥ 16px on interactive web inputs  
- Line-height ~1.45–1.5 for body; tighter (1.2–1.3) for dense table rows  
- Weights: 400 body, 500 labels, 600 titles/buttons — avoid 800+ shouting

### Spacing (Density 8 — dashboard)

Prefer the existing `spacing` scale in `theme.ts` (`xs` 4 → `xl` 20). For denser tables:

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` | Icon gaps |
| `--space-sm` | `8px` | Inline chips, table cell padding |
| `--space-md` | `12px` | Compact panel padding |
| `--space-lg` | `16px` | Standard section padding |
| `--space-xl` | `20–24px` | Page gutters |
| `--space-2xl` | `32px` | Rare — major section breaks only |

Layout constants: `sidebarWidth` 220, `contentMaxWidth` 1400, `desktopBreakpoint` 768 (`layout` in `theme.ts`).

### Elevation & Radius

- Prefer **hairline borders** (`borderSubtle` / `rgba(255,255,255,0.06)`) over heavy shadows on dark OLED  
- Radius: **8px** controls/inputs, **10–12px** panels — not pill-everything  
- Shadows only for floating menus/modals (`overlay` + slight lift); no multi-layer neumorphism

---

## Component Specs

### Buttons

- **Primary:** `accent` fill, `buttonText` (`#000`), weight 600, radius 8, min height 40 (44 on touch)  
- **Secondary:** transparent + `borderMuted`, text body color  
- **Danger:** `error` border/text; confirm destructive in two-step (existing reboot/delete pattern)  
- Transitions 150–200ms; press scale ≤ 0.98 (Reanimated), no layout-shifting scale on hover  
- Web: `cursor: pointer` on all clickable elements

### Panels / "cards"

Default: **no decorative cards**. Use bordered panels only when they group an interaction (forms, expand rows, wizards). Background = `bgPanel` / `bgSecondary`, border = `borderSubtle`. Avoid shadow + radius + fill stacks that read as generic SaaS cards.

### Tables / lists (Servers, Projects)

- Dense rows, scannable status column (Online + optional flag / Offline)  
- Expand-in-place for detail (existing servers pattern) — don't open a modal for every action  
- Checkbox batch actions when manage-gated  
- Skeletons for loads > 300ms; never freeze the shell

### Inputs

- `bgInput`, border `borderMuted`, focus ring using accent at ~25% opacity  
- Visible labels (never placeholder-only)  
- Errors adjacent to the field (`errorText`)

### Status

| State | Color | Extra cue |
|-------|-------|-----------|
| Online / success | `accent` | Filled or pulsing dot |
| Offline | `textMuted` | Hollow / dim |
| Pending | `pending` | Optional spinner |
| Failed | `error` | Text + icon |

### Charts (server metrics)

- Library: `react-native-gifted-charts` (existing)  
- Prefer **line / area** for time-series; paired charts only (never dump all 20 metrics)  
- Gaps ≠ zeros — keep `interpolateMissingValues={false}` + coverage strip  
- Respect `prefers-reduced-motion` (no perpetual pulse on historical charts)

### Icons

- SVG only (Lucide / Expo Symbols / Simple Icons for OS logos) — **never emoji as icons**  
- Consistent stroke weight; status dots are geometric, not emoji

---

## Style Guidelines

**Primary style:** Dark Mode (OLED)  
**Secondary polish:** Soft elevation + optional light glass on sticky headers (BlurView intensity ≤ 20) — sparingly  

**Keywords:** dense, scannable, ops, instrument, green live, monochrome chrome, hairline borders, Reanimated micro-motion  

**Key effects (keep restrained):**
- Staggered fade-in on first paint (Y 8–12 → 0, opacity 0 → 1, 150–250ms)  
- Status dot pulse only for *live* connected state  
- Spring modals (`damping ~20`, `stiffness ~90`)  
- No GSAP page-wipe overlays (Expo Router — use native/layout transitions)

---

## Motion

| Interaction | Duration | Notes |
|-------------|----------|-------|
| Hover / focus | 150–200ms | Opacity / border only |
| Expand row | 200–250ms | Height + opacity |
| Route change | Native / Reanimated | No blocking overlay tied to data fetch |
| Reduced motion | Off / instant | Honor `prefers-reduced-motion` / RN `reduceMotion` |

---

## Stack Notes (Expo / React Native / Tamagui)

- Tokens in `src/lib/theme.ts` — components consume `colors` / `spacing` / `layout`, not raw hex  
- Prefer Tamagui primitives when adding new shared UI; existing org screens use RN `StyleSheet` — match local file style when editing  
- Touch targets ≥ 44×44; web hover must not be the only affordance  
- `accessibilityLabel` / `accessibilityRole` on icon-only controls  
- Deep links via Expo Router already — preserve URL-addressable org routes  
- Never per-server Durable Object polls from UI — O(1) Postgres status reads only (see AGENTS.md)

---

## Anti-Patterns (Do NOT Use)

- ❌ Light-mode-first layouts or cream/serif "AI brochure" looks  
- ❌ Purple / indigo gradient SaaS clichés  
- ❌ Neon cyberpunk / matrix green / glitch / scanlines  
- ❌ Emoji as icons  
- ❌ Decorative card grids in the hero or overview chrome  
- ❌ Excessive animation or perpetual blob backgrounds  
- ❌ Placeholder-only form labels  
- ❌ Color-only status (always pair with text/shape)  
- ❌ Per-server polling loops / DO cell reads on normal pages  
- ❌ World-readable secrets or install keys shown after leave-page

---

## Pre-Delivery Checklist

- [ ] No emojis as icons (SVG / Symbols only)  
- [ ] `cursor-pointer` (web) on clickable elements  
- [ ] Hover/press transitions 150–300ms  
- [ ] Text contrast ≥ 4.5:1 (7:1 preferred on OLED body text)  
- [ ] Focus rings visible for keyboard nav  
- [ ] `prefers-reduced-motion` respected  
- [ ] Responsive: 375 / 768 / 1024 / 1440  
- [ ] Touch targets ≥ 44×44 on native  
- [ ] Loading feedback for waits > 300ms  
- [ ] Destructive actions use two-step confirm  
- [ ] Colors come from `theme.ts` tokens  

---

## How agents use this file

1. Read this MASTER.  
2. Check `design-system/turbopanel/pages/<page>.md` for overrides.  
3. Run ui-ux-pro-max searches as needed:  
   `python3 .cursor/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain>`  
4. Implement against `src/lib/theme.ts` + existing org shell patterns.
