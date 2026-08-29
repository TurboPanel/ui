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

**Style blend:** Dark Mode (OLED) + Soft UI Evolution + **frosted chrome** — not cyberpunk neon, not light SaaS purple, not iridescent chromatic aberration.

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
| Green (self-hosted / run / online) | `#3dd68c` | `colors.green` / `colors.accent` — online status always; Deno chrome |
| Blue (HA) | `#3366cc` | `colors.blue` — Workers / HA interactive chrome |
| Pending / warn | `#e0b341` | `colors.pending` |
| Error | `#ff6b6b` | `colors.error` |
| Info / command | `#9ad2ff` | `colors.command` |
| Overlay | `rgba(0,0,0,0.6)` | `colors.overlay` |

**Color notes:** Dual brand — light green + `#3366cc` blue (aligned with website `--tp-green` / `--tp-blue`). Interactive chrome (sidebar active states, primary CTAs, toolbar chips) follows control-plane runtime via `chrome.*` tokens (`applyConsoleChromeRuntime`): **Workers (HA) → blue**, **Deno (self-hosted) → green**. **Online / live status stays green** always (`colors.green` / `colors.accent`). Auth screens use the same runtime mapping. Status must never rely on color alone (pair with label/dot shape).

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

### Frosted chrome (secondary polish)

Canonical tokens: `src/lib/glass.ts` (`glass.*`). Surface primitive: `src/components/glass/glass-surface.tsx`.

| Token | Value | Usage |
|-------|-------|-------|
| `glass.fill` | `rgba(10,10,10,0.72)` | Auth / panel frosted fill |
| `glass.fillStrong` | `rgba(8,8,8,0.82)` | Sticky header, sidebar |
| `glass.fillSoft` | `rgba(17,17,17,0.55)` | Nested chips / section headers |
| `glass.border` | `rgba(255,255,255,0.12)` | Glass rim (replaces flat border on chrome) |
| Blur / saturate | `16px` / `160%` | Web `backdrop-filter`; soft `12px`, strong `20px` |

**Where to use:** sticky header, sidebars / drawer, auth form panel (over the grid wash), `SectionPanel` shells, floating menus.  
**Where not:** dense table cells, chart plots, monospace log blocks, every nested inset.  
**Native:** iOS 26+ uses `expo-glass-effect` `GlassView` when the native glass API is available; web uses CSS blur; other platforms get translucent fill only.  
**A11y / perf:** honor `prefers-reduced-transparency` when available; keep text contrast ≥ 4.5:1 on frosted fills; avoid stacking many large blurred regions.

---

## Logo / brand mark

- Geometry lives in **`assets/brand/`** (`turbopanel-logo*`) and the inline SVG component **`src/components/brand/turbopanel-logo.tsx`** — landscape mark is ink-tight `628×370` (no embedded clear-space pad)
- Color mark uses `colors.green` + `colors.blue`; `white` / `mono` variants for special surfaces
- Org sidebar, admin sidebar, auth shell, and `AppShell` use `TurboPanelLogo` / `TurboPanelLogoMark` — **T mark only** in product chrome (full “urboPanel” lockup is **website-only**). Mark sizing via `consoleMarkRenderSize` in `src/lib/wordmark-lockup.ts`. The mark **is** the T — never render “TurboPanel” beside it in the console.
- Public downloads + usage copy: marketing site **`/about/logo`**

## Component Specs

### Buttons

- **Primary:** `accent` fill, `buttonText` (`#000`), weight 600, radius 8, min height 40 (44 on touch)  
- **Secondary:** transparent + `borderMuted`, text body color  
- **Danger:** `error` border/text; confirm destructive in two-step (existing reboot/delete pattern)  
- Transitions 150–200ms; press scale ≤ 0.98 (Reanimated), no layout-shifting scale on hover  
- Web: `cursor: pointer` on all clickable elements  
- **Header account controls** (org switcher, user menu, notifications, admin Return to instance): **not** bordered buttons. Rest transparent; hover/press fill `bgSecondary` as a rounded tile; open menu uses `chrome.bgActive`. Keep a keyboard focus ring.
  - **Web:** separate notifications bell (right of account) opens its own empty panel until the API exists; unread badge on the bell only when count > 0. Desktop menus stay anchored dropdowns.
  - **Compact / iOS / Android:** no bottom drawers. Org menu slides down from the top; account / notifications slide in from the right (`HeaderMenuOverlay`). Native org switcher shows the organization display name (truncated to 20 characters) plus chevron — not icon-only. The compact menu is a **searchable, scrolling org list** with a sticky **Manage** / **New** footer and **View all organizations** (full page at `/organizations`). Native profile is a circular avatar with the user icon inside (`AccountAvatar`), unread badge only when count > 0, and no chevron.

### Panels / "cards"

Default: **no decorative cards**. Use bordered panels only when they group an interaction (forms, expand rows, wizards). Background = `bgPanel` / `bgSecondary`, border = `borderSubtle`. Avoid shadow + radius + fill stacks that read as generic SaaS cards.

### Navigation inside a surface

**Before adding a nav list, check whether the things in it are actually peers.** Usually they are not: some are representations of one artifact, and the rest are properties of an object on screen. A flat list of destinations is the generic dev-tool layout, and it forces the operator to leave the thing they are looking at in order to configure it.

- **Representations of one artifact** → a short **lens** switch (segmented control), fixed in size. Overview · Compose · Services on the project editor is the reference.
- **Properties of an object** → hang them off that object and expand **inline** — a gutter fact on the row, not a page. See `ComposeDocumentView`.
- **Properties of a scope** → one gear on the scope strip.
- `SectionNav` (`src/components/ui/section-nav.tsx`) remains for genuinely short in-surface mode toggles. It is horizontal-only: **there is no rail variant**, and a side list of destinations is not an option in this product.
- Counts belong on the item or in the gutter, never as a separate legend row.

### Inline notices (state statements)

- `InlineNotice` (`src/components/ui/inline-notice.tsx`) — left accent bar, title, optional body, optional actions. Info uses `colors.command`; warning uses `colors.pending`.
- A message that explains the content beneath it belongs **in the flow**, above that content. Do not use a modal or a scrim for it: the dialog hides the thing being explained and demands a dismissal the user never asked for. Reserve modals for choices that must be made before anything else can happen.
- Read-only content being explained should stay genuinely readable — recessed background, a `… · READ ONLY` micro-label, normal body contrast. Never dim it to illegibility to signal "not editable".

### Selectors that grow

- A fixed set (≤5) is a chip strip / segmented control. A list that grows with the fleet or the org gets a **searchable picker**: a trigger reading as the current selection, an anchored menu on desktop, a bottom sheet on compact, and a filter field once the list is long enough to scan (see `ProjectScopePicker`, `OrganizationSwitcherList`).
- For **form selects** the shared control is `Select` (`src/components/ui/select.tsx`) — same pattern as a full-width form field, virtualized list that lands on the current value, `mono` for IDs/timezones, `noneLabel` for an explicit inherit/none option. Never render a long list as a platform `<select>` or a stacked inline option list; reserve `FormSelect` (`src/components/org/form-select.tsx`) for legacy short fixed lists until its call sites migrate.
- Never solve growth by letting a horizontal strip scroll — options then hide off-screen with no affordance.
- Never label every row with the same string. If the natural name repeats (one resource per server), label by what differs (`src/lib/resource-labels.ts`).

### Count tiles

- **Inside a surface:** `StatTiles` (`src/components/ui/stat-tiles.tsx`) — icon + mono value + uppercase caption, fill-only (no border, so it does not read as a card inside a card), auto-fit grid. A zero count **dims**, it does not disappear: the set of resource types is itself information.
- **Page level:** `StatusStatBoxes` (`src/components/org/status-stat-boxes.tsx`) — wider bordered label-first tiles for fleet / org glance numbers.
- Never render counts as a run of `2 environments · 1 server · 3 services` text.

### Diagram keys / legends

- One quiet hairline pill, right-aligned under the canvas — chrome for the diagram, not a content block. Micro uppercase labels, `textDim`, small swatches that match the node shapes exactly.
- Prefer labelling the node itself over growing the key.

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

### Bottom tab bar (native)

- Plain fill (`glass.fillStrong`) + top hairline — no `GlassSurface`/`GlassView` rim
- Platform-standard content row (`layout.bottomTabHeight`: 49 iOS / 56 Android); icon + label per tab (never icon-only); ≥44pt touch targets
- Active: `chrome.accent` plus a thin top indicator bar — never colour-only
- On each tab's **overview** only (`/{orgId}/overview`, `/{orgId}/projects`, `/{orgId}/servers` — not nested detail/settings), a finger-following pager swipes to the adjacent tab (does not wrap past Overview or Servers). Snap is 280ms; reduced motion jumps. Nested routes keep vertical scroll, pull-to-refresh, and back.
- Switching organizations **replaces** the org console in place (no stack push, no swipe-back to the previous org).

---

## Style Guidelines

**Primary style:** Dark Mode (OLED)  
**Secondary polish:** Soft elevation + **frosted chrome** (via `GlassSurface` / `glass.*` tokens)  

**Keywords:** dense, scannable, ops, instrument, green live, monochrome chrome, hairline borders, frosted glass, Reanimated micro-motion  

**Key effects (keep restrained):**
- Frosted chrome on shell surfaces (header, sidebar, auth panel, section shells)  
- Staggered fade-in on first paint (Y 8–12 → 0, opacity 0 → 1, 150–250ms)  
- Status dot pulse only for *live* connected state  
- Spring modals (`damping ~20`, `stiffness ~90`)  
- No GSAP page-wipe overlays (Expo Router — use native/layout transitions)  
- No iridescent rainbow / chromatic aberration blobs

---

## Motion

| Interaction | Duration | Notes |
|-------------|----------|-------|
| Hover / focus | 150–200ms | Opacity / border only |
| Expand row | 200–250ms | Height + opacity |
| Route change | Native / Reanimated | Org switch is a replace (no slide). Native tab overviews use a 280ms pager; nested org routes keep the platform stack. |
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
- ❌ Full iridescent / chromatic-aberration marketing excess on ops chrome  
- ❌ Glass on every dense table cell or chart (blur cost + contrast risk)  
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

1. Check `design-system/turbopanel/pages/<page>.md` for overrides (page wins).  
2. Read this MASTER.  
3. Run supplemental ui-ux-pro-max searches as needed (do not let results override page overrides or this Master):  
   `python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain>`  
4. Implement against `src/lib/theme.ts` + existing org shell patterns.
