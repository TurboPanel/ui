# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/turbopanel/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** TurboPanel  
**Generated:** 2026-07-19 (curated from ui-ux-pro-max). Rewritten 2026-10-04 for the v4 "Navy & Tee" redesign.  
**Category:** Developer Tool / DevOps Control Plane (B2B SaaS)  
**Stack:** Expo 57 · React Native · Tamagui · Expo Router · React Query · gifted-charts  
**Design Dials:** Variance 4/10 (Balanced) | Motion 4/10 (Standard) | Density 8/10 (Dense / Dashboard)

---

## North Star

TurboPanel is a **precise ops console in two first-class themes**: **Navy** (dark) and **Paper** (light). The default follows the device; the user can pick Light, Dark or Match computer, and the choice is saved in the browser only (never on the server). Blue is ours (chrome, primary action, links); green means running / live and nothing else. Dense scannable tables, no decorative fluff. Speed is the brand; the UI should feel like a precise instrument, not a marketing site.

The v4 redesign ("Navy & Tee") replaced the earlier rules (one dark theme, no display font). Dark is no longer the default or the priority: every screen must work and read well in both themes. v4 display type is **Plus Jakarta Sans** (page titles 800 italic, section titles 700); UI text is Geist Sans and code is Geist Mono (see Typography).

**Style blend:** Navy and Paper palettes + hairline borders + restrained **frosted chrome**. Not cyberpunk neon, not purple SaaS, not iridescent chromatic aberration. Banned looks: near-black `#0b0b0c` neutrals, a neutral ink primary button, purple gradients, glassy cards on content, left-border accent cards.

---

## Global Rules

### Color Palette

Source of truth: the v4 spec tokens in `src/lib/theme-palettes.ts` (two palettes, Navy and Paper, same token names). Components read `colors.*` from `src/lib/theme.ts`; on web each entry is a CSS variable (`var(--tp-bg)`) that the page switches per theme, so a screen follows the theme with no per-file code. Never write one-off hex in components, never do colour maths on a `colors.*` value (it is a variable reference on web), and use `useColors()` (`src/lib/theme-preference.ts`) in the rare place that needs a real hex.

| Role (v4 token) | Navy (dark) | Paper (light) | Old key still in use |
|------|------|------|------|
| Page `bg` | `#0b1220` | `#f5f7fa` | `colors.bg` |
| Sidebar | `#0e1627` | `#edf1f7` | `bgSidebar` |
| Card `surface` | `#121b2e` | `#ffffff` | `bgPanel`, `bgArea` |
| `surface-2` / `surface-3` | `#17223a` / `#1e2b47` | `#f7f9fc` / `#e9eef6` | `bgAreaHeader` / `bgSecondary` |
| Field | `#0f1828` | `#ffffff` | `bgInput` |
| Hairline `sep` / `sep-strong` | white-blue at 14% / 24% | navy at 9% / 16% | `borderSubtle`, `borderArea` / `border`, `borderMuted`, `borderChip` |
| Field border | `#5b6b8a` | navy at 50% | `fieldBorder` (inputs, checkboxes: 3:1) |
| Text / `text-2` / `text-3` | `#e8eef7` / `#c9d4e5` / `#9fb0cb` | `#0f172a` / `#334155` / `#52607a` | `text`, `textTitle` / `textBody`, `textChip`, `stdout` / `textMuted`, `textDim`, `textFaint`, `textLabel` |
| Brand / primary action `accent` | `#3366cc` (white text, 5.4:1) | `#2b59c3` (white text, 6.3:1) | `chrome.accent`, `chrome.onAccent`, `chrome.bgActive` |
| Link / text on dark blue `link` | `#86a8ff` | `#2b59c3` | `colors.link`, `command` |
| `ok` (running / live) | `#3dd68c` | `#0b7444` | `green` |
| `busy` (in progress) | `#b49dff` | `#5b3fd0` | |
| `warn` (not deployed, warning) | `#f2b84b` | `#8a5700` | `pending` |
| `bad` (failed, crashed) | `#ff7a7a` | `#c22a2a` | `error`, `errorText` |
| `idle`, `base` | `#94a0b6`, `#7fa4ff` | `#5d6678`, `#2b59c3` | `log` |
| Scrim | `rgba(11,18,32,.72)` | `rgba(245,247,250,.72)` | `overlay` |

**Colour jobs, one per hue:** blue = ours (chrome, primary action, links, Base); green = running / live; violet = in progress; amber = not deployed / warning; red = failed / crashed; teal = data lines on the map only. `*Soft` tokens are the 9 to 16 percent tints behind a tone's text.

**Rules:**
- Text on a surface and on a tone's soft tint must stay at **4.5:1 or better** in both themes; `src/lib/theme-palettes.test.ts` checks the v4 table and every old key pair. Change a palette value only with that test green.
- Brand blue is a **fill and border** colour. Blue **text** on a dark surface uses `colors.link` (the lighter blue), never `chrome.accent`.
- `colors.green` / `colors.ok` is for running / live / success only; `colors.accent` is now the brand-blue fill, no longer a green: use `colors.ok` where it meant online.
- Status is never colour alone: pair it with a word and a glyph.
- Interactive chrome is brand blue on both control-plane runtimes (self-hosted and High Availability); the runtime only changes the label, not the colour.
- The sign-in and other auth screens always paint on Navy (their animated wash uses fixed hex); they pin it with `data-theme="dark"` on web.

### Typography

| Role | Font | Where it is set |
|------|-------|-------|
| Page titles (800 italic, 28px, -0.5 tracking), section titles (700) | Plus Jakarta Sans | `src/lib/v4/typography.ts` roles `displayItalic`, `display` (the v4 primitives use them; unconverted screens still use Inter) |
| UI / body | Geist Sans 400 / 500 / 600 | roles `body`, `bodyMedium`, `bodySemibold` |
| SHAs, commands, paths, logs, metrics | Geist Mono 400 / 500 / 600 | roles `mono`, `monoMedium`, `monoSemibold` |

Each weight is a separate font file and family name (a phone applies `fontWeight` unreliably to a custom font), so a component picks a role and never sets `fontWeight` beside it. The files come from `@expo-google-fonts/*` and ship inside the app; no font host is linked.

- Italic is for page titles and the Live hero URL only
- Type scale: 28 / 20 / 17 / 14 / 13 / 12 / 11 (mono 12.5); base size at least 16px on interactive web inputs
- Line-height ~1.45 for body; tighter (1.2 to 1.3) for dense table rows

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

- Prefer **hairline borders** (`borderSubtle`) over heavy shadows, in both themes  
- Radius: **8px** buttons / fields / segmented controls, **12px** cards and groups, **14px** layer cards, pills 999 — not pill-everything  
- Shadows only for floating menus/modals (`overlay` + slight lift); no multi-layer neumorphism

### Frosted chrome (secondary polish)

Canonical tokens: `src/lib/glass.ts` (`glass.*`). Surface primitive: `src/components/glass/glass-surface.tsx`.

| Token | Navy | Paper | Usage |
|-------|-------|-------|-------|
| `glass.fill` | `rgba(18,27,46,.74)` | `rgba(255,255,255,.78)` | Auth / panel frosted fill |
| `glass.fillStrong` | `rgba(14,22,39,.86)` | `rgba(255,255,255,.90)` | Sticky header, sidebar, menus |
| `glass.fillSoft` | `rgba(23,34,58,.58)` | `rgba(247,249,252,.70)` | Nested chips / section headers |
| `glass.border` | `rgba(168,181,204,.18)` | `rgba(15,23,42,.12)` | Glass rim (replaces flat border on chrome) |
| Blur / saturate | `16px` / `160%` | same | Web `backdrop-filter`; soft `12px`, strong `20px` (decoration only: phone drops it) |

**Where to use:** sticky header, sidebars / drawer, auth form panel (over the grid wash), `SectionPanel` shells, floating menus.  
**Where not:** dense table cells, chart plots, monospace log blocks, every nested inset.  
**Native:** iOS 26+ uses `expo-glass-effect` `GlassView` when the native glass API is available; web uses CSS blur; other platforms get translucent fill only.  
**A11y / perf:** honor `prefers-reduced-transparency` when available; keep text contrast ≥ 4.5:1 on frosted fills; avoid stacking many large blurred regions.

---

## Logo / brand mark

- Geometry lives in **`assets/brand/`** (`turbopanel-logo*`) and the inline SVG component **`src/components/brand/turbopanel-logo.tsx`** — landscape mark is ink-tight `628×370` (no embedded clear-space pad)
- Color mark uses `colors.logoBars` + `colors.logoTee` (theme-aware); `white` / `mono` variants for special surfaces
- Org sidebar, admin sidebar, auth shell, and `AppShell` use `TurboPanelLogo` / `TurboPanelLogoMark` — **T mark only** in product chrome (full “urboPanel” lockup is **website-only**). Mark sizing via `consoleMarkRenderSize` in `src/lib/wordmark-lockup.ts`. The mark **is** the T — never render “TurboPanel” beside it in the console. On the hosted (Workers) control plane a slim **HIGH AVAILABILITY** pill sits beside the T (`src/components/brand/high-availability-wordmark.tsx`: one line of tiny letter-spaced caps, 1px HA-blue gradient border, blue-tinted fill; `compact` = the same pill reading “HA” on narrow headers); nothing renders on self-hosted or before the runtime is known. Under the full pill, right-aligned to its edge, a tiny muted tabular line carries the control plane's version from `/api/health` (`v0.1.1 · 18ad2b0`, the sha linked to its source commit; version only when the commit is unknown), followed on a testing or staging deployment by the environment in colour (**Testing** amber `pending`, **Staging** blue `command`; nothing on live) — its line is reserved from the first render so the pill never shifts; the compact pill has none. Self-hosted has no pill: the same muted line sits beside the T alone, showing the exact installed build label (`v0.1.1-canary.…`, `v0.1.1-rc.1`) when `/api/health` reports one. Formatting lives in `src/lib/control-plane-version.ts`.
- Public downloads + usage copy: marketing site **`/about/logo`**

## Component Specs

### Buttons

- **Primary:** brand-blue `chrome.accent` fill, `chrome.onAccent` (white) text, weight 600, radius 8, min height 40 (44 on touch)  
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

- `bgInput`, border `fieldBorder` (3:1 against the surface), focus ring `chrome.accent`  
- Visible labels (never placeholder-only)  
- Errors adjacent to the field (`errorText`)

### Status

| State | Color | Extra cue |
|-------|-------|-----------|
| Online / success | `ok` | Filled or pulsing dot + word |
| Offline | `textMuted` | Hollow / dim |
| Pending | `pending` | Optional spinner |
| Failed | `bad` | Text + icon |

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

**Primary style:** two first-class themes, Navy (dark) and Paper (light), Match computer by default  
**Secondary polish:** Soft elevation + **frosted chrome** (via `GlassSurface` / `glass.*` tokens)  

**Keywords:** dense, scannable, ops, instrument, navy and paper, blue chrome, green live, hairline borders, frosted glass, Reanimated micro-motion  

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

- ❌ A screen that only works in one theme (check Navy and Paper), and cream/serif "AI brochure" looks  
- ❌ Near-black `#0b0b0c` neutrals, a neutral ink primary button, left-border accent cards  
- ❌ Colour maths on `colors.*` values (they are CSS variable references on web)  
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
- [ ] Checked in both Navy and Paper (switch in the header); text contrast ≥ 4.5:1 in each  
- [ ] Focus rings visible for keyboard nav  
- [ ] `prefers-reduced-motion` respected  
- [ ] Responsive: 375 / 768 / 1024 / 1440  
- [ ] Touch targets ≥ 44×44 on native  
- [ ] Loading feedback for waits > 300ms  
- [ ] Destructive actions use two-step confirm  
- [ ] Colors come from `theme.ts` tokens (no raw hex); blue text uses `colors.link`  

---

## How agents use this file

1. Check `design-system/turbopanel/pages/<page>.md` for overrides (page wins).  
2. Read this MASTER.  
3. Run supplemental ui-ux-pro-max searches as needed (do not let results override page overrides or this Master):  
   `python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain>`  
4. Implement against `src/lib/theme.ts` + existing org shell patterns.
