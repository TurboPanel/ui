# Design System — AGENTS.md

## Design system (ui-ux-pro-max)

This repo is the **signed-in product console** (org + admin + install/sign-in), not the public marketing site. Visual work must follow the installed **ui-ux-pro-max** skill and the persisted TurboPanel console design system. Do not invent a parallel look from generic SaaS defaults or from `~/website`.

### This repo vs marketing site (`~/website`)

| | **ui** (this repo) | **website** (`~/website`) |
| --- | --- | --- |
| Surface | Org console, admin, install/sign-in product UI | Marketing pages, landing/heroes, docs chrome, pricing/roadmap |
| North star | Ops console in two first-class themes (Navy dark, Paper light), dense tables | Fast, trustworthy, **light-first** marketing + readable docs (dark mode supported) |
| Design system | `design-system/turbopanel/` | `design-system/turbopanel-website/` |
| Skill path | `.agents/skills/ui-ux-pro-max/` | `.agents/skills/ui-ux-pro-max/` |
| Tokens | `src/lib/theme-palettes.ts` + `src/lib/theme.ts` (`colors`, `chrome`, `spacing`, `layout`) | `--tp-*` in `src/app/globals.css` |
| Stack search | `--stack react-native` | `--stack nextjs` |

Shared brand cues only: blue `#3366cc` (ours) and green `#3dd68c` (running). The console follows the v4 "Navy & Tee" system in its own `design-system/turbopanel/`, including Plus Jakarta Sans display type for titles (Geist for text, Geist Mono for code; see Stack › Fonts). Do **not** copy the website's light-first marketing layout or the website Master into the console — and do not apply console density / Tamagui patterns to the marketing site.

### When to use (mandatory)

Invoke the skill **before designing or changing visuals** when the task touches any of:

- New pages, routes, or org/admin areas
- Visual redesigns; layout / spacing / typography / color
- New or refactored components with visible chrome (panels, tables, forms, empty states, wizards)
- Charts / data visualization, navigation chrome, motion / transitions
- UX / accessibility / consistency reviews of existing UI

Skip the skill for pure non-visual work (API wiring with no UI change, types-only, fetch/query logic, copy-only string tweaks that do not affect layout) — unless the change alters how something looks, moves, or is interacted with. If you touch JSX layout or styles, use the skill.

### Canonical paths

| What | Path |
| --- | --- |
| Skill (read first) | [`.agents/skills/ui-ux-pro-max/SKILL.md`](.agents/skills/ui-ux-pro-max/SKILL.md) |
| Search CLI | `.agents/skills/ui-ux-pro-max/scripts/search.py` |
| Master (global SoT) | [`design-system/turbopanel/MASTER.md`](design-system/turbopanel/MASTER.md) |
| Page overrides | `design-system/turbopanel/pages/<page>.md` (page **wins** over Master) |
| Runtime tokens | `src/lib/theme.ts` over `src/lib/theme-palettes.ts` — no one-off hex in components |
| Frosted chrome | `src/lib/glass.ts` + `src/components/glass/glass-surface.tsx` (frosted surface; iOS 26+ `expo-glass-effect`) |
| Shared UI primitives | `src/components/ui/` — barrel `src/components/ui/index.ts` (see [Component layer](../src/components/AGENTS.md)) |
| Shared panel patterns | `src/components/ui/panel-styles.ts` (`panelStyles`) |

**Page overrides that exist today** (do not invent others): `sign-in.md`, `about.md`, `overview.md`, `manage.md`, `organizations.md`, `servers.md`, `datacenters.md`, `server-detail.md`, `server-metrics.md`, `network.md`, `projects.md`, `project-create.md`, `managed-services.md`, `variables.md`, `service-settings.md`, `storage.md`, `tls.md`, `deploy-logs.md`, `container-logs.md`, `git-sources.md`, `billing.md`, `access.md`, `updates.md`. If no page file exists for a surface, follow Master only; add a page override when that surface needs durable exceptions.


### Mandatory first steps

From the **ui repo root**, before building or restyling UI:

1. **Read** `.agents/skills/ui-ux-pro-max/SKILL.md` (workflow, domains, anti-pattern priorities).
2. **Search** the skill DB (prefer `python3` if `python` is missing):

```bash
# Persisted console system — start here for page/chrome work
python3 .agents/skills/ui-ux-pro-max/scripts/search.py \
  "devops control plane dark dense dashboard" --design-system -p "TurboPanel"

# Domain deep-dives as needed
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain style
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain color
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain typography
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain ux
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain chart
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain icons

# Stack guidance for this repo (Expo / React Native web + native)
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<query>" --stack react-native
```

3. **Read** `design-system/turbopanel/MASTER.md`, then `pages/<page>.md` if it exists (page overrides Master).
4. **Reuse** existing org/admin patterns (`org-panel-styles.ts`, neighboring section components) before inventing new chrome.
5. **Implement** with `theme.ts` tokens — no one-off hex in components. Match empty/loading/chart states already documented on that page when present (e.g. `server-metrics.md`).

Do **not** regenerate Master with `--persist --force` unless an explicit redesign was requested. Master already exists and is curated.

### Decision order

Apply in this order (later steps only fill gaps; they do not override earlier project rules):

1. **Product constraints** (below) + platform-copy rules — non-negotiable brand / palette / density
2. Page override `design-system/turbopanel/pages/<page>.md` (if present)
3. Master `design-system/turbopanel/MASTER.md`
4. Skill guidance (`SKILL.md` + `search.py`) — required for a11y, interaction, UX, and `--stack react-native`; do **not** let generic skill palettes replace TurboPanel tokens
5. Existing org/admin component patterns in this repo
6. New code

### Product constraints (keep)

These are non-negotiable for the console (detail lives in Master):

- Two first-class themes, **Navy** (dark) and **Paper** (light); the default follows the device, and the choice (Light / Dark / Match computer) is saved in the browser only. Every screen must work in both. See [Theme](#theme)
- Dense ops tables
- Interactive chrome (nav, CTAs, toolbar) is brand blue via `chrome.*` on both control-plane runtimes; **online / live status stays green** (`colors.ok`, alias `colors.green`); blue **text** uses `colors.link`
- Soft elevation / hairline borders + restrained **frosted chrome** on shell chrome — **not** light SaaS, purple gradients, cyberpunk neon, or iridescent aberration
- Design dials already chosen: variance ~4, motion ~4, density ~8 (dashboard)
- Tokens only from `src/lib/theme.ts` (`colors` + `chrome`) and `src/lib/glass.ts` — no parallel hex systems
- **Version entry beside the T mark** (`src/components/brand/high-availability-wordmark.tsx`, rules in `src/lib/control-plane-version.ts` + `src/lib/update-entry.ts`): the control plane's version from `/api/health` as plain `vX.Y.Z` on both editions (no `-canary.N` / `-rc.N` suffix, never the commit), a yellow word (`warn` tokens) when not live (hosted by `environment`: Testing / Staging; self-hosted by `channel`: Canary / RC, the old `trunk` name counts as Canary, anything else shows none), and for instance admins only an update icon when an update is waiting or updates are paused ("Update" beside it on live builds only; nothing until the version is known). Waiting: on self-hosted the control plane, web interface or co-located daemon is behind; `daemonsBehind` and `updatesPaused` on `GET /instance/updates` are reserved for the automatic update system and read only through `fleetUpdateSignals`. Clicking opens the versions popup (`versions-sheet.tsx`: control plane and web interface versions only), or Admin > Updates for an instance admin with the icon showing. Organization managers and members get no icon and always the popup. The "HIGH AVAILABILITY" pill is unchanged; self-hosted shows no edition text.
- **Platform copy:** user-facing “Workers / Cloudflare / edge” → **TurboPanel High Availability** (`HA_PRODUCT_NAME` in `src/lib/platform-copy.ts`). Never bare “High Availability” or “HA” in UI copy. The org mesh product is **TurboFabric** (`TURBOFABRIC_PRODUCT_NAME`) — never “tp0 fabric”, “which WireGuard network should this container join?”, or “the WireGuard mesh”. Backend identifiers unchanged. User-facing copy says **Platform CA** or **Organization CA**, never bare “CA certificate” / “org CA”.

### Anti-patterns / do-not

- Skip the skill and freestyle a purple/indigo SaaS or cream+serif “AI default” look
- Apply the `~/website` light-first marketing / docs chrome or its Master to the console
- A screen that is only checked in one theme; colour maths on `colors.*` (web values are CSS variables)
- Raw hex in components when a `theme.ts` token exists
- Ignore a page override when one exists for the surface you’re editing
- Silent `--persist --force` of Master (discards curated decisions)
- Decorative card stacks, emoji-as-icons, status conveyed by color alone
- Copy website search project name (`TurboPanel Website`) or `--stack nextjs` into this repo

### Theme

Two palettes (v4 "Navy & Tee"): **Navy** (dark) and **Paper** (light), defined once in `src/lib/theme-palettes.ts` with the spec's token names; the old `colors.*` keys (`bgPanel`, `textMuted`, ...) are aliases of those tokens, so older screens follow the theme untouched.

- **Choice:** Light, Dark or Match computer (default). Stored in this browser only (`localStorage` key `turbopanel.theme`, never on the server), kept by `src/lib/theme-preference.ts` (`useThemeMode`, `useColorScheme`, `useColors`, `setThemeMode`). The switch is the Theme row of `UiSettings` (`src/components/ui-settings-panel.tsx`) in the profile menu.
- **Web:** `colors.*` are CSS variable references (`var(--tp-bg, <navy>)`). The stylesheet that defines them is generated by `themeCss()` and shipped in `src/app/+html.tsx`; `public/theme-boot.js` (a file, not inline script, so the CSP hash list stays valid; a test keeps it equal to `themeBootScript()`) applies a saved Light or Dark choice before first paint. Any element with `data-theme="dark"` or `"light"` re-points the variables for its subtree (the auth screens pin Navy this way).
- **Phone app:** `colors.*` are the Navy values and the resolved scheme is always dark; the switch is not drawn there. Native screens read fixed values at import time, so a native Light theme needs each screen moved to `useColors()` first (do that as each screen is rebuilt).
- **Rules for code:** no raw hex; never do colour maths on `colors.*` (no `colors.x + '33'`, no hex parsing, no `Animated` colour ranges): use a `*Soft` token or `useColors()`, which returns real values. Libraries that parse colours themselves (`expo-linear-gradient`, `Animated.interpolate`) need `useColors()` or Navy hex. Blue text uses `colors.link`; `chrome.accent` is a fill and border colour. Tamagui follows the same scheme through `<Theme name={scheme}>` in `app-providers.tsx`.
- **Checks:** `theme-palettes.test.ts` holds the contrast table (4.5:1 text, 3:1 field borders, every old key pair, both themes). Look at any changed screen in both themes before opening the PR.

### Console surfaces and shared patterns (web)

Plans and roadmaps live outside the repo, in the Master Sheet.

**Compose parity (docker-compose projects):** service settings panel, variable deploy flags (`isLiteral` / build / runtime), hosting proxy toggles, optional health-check policy (`disabled` default — compose/`image` HEALTHCHECK is enough when present; `warn`/`required` are opt-in gates), storage registry UI, project principals, org/server resource limits API — see `design-system/turbopanel/pages/service-settings.md`.

**Shared UI kit (`src/components/ui/`, barrel `index.ts`):** `Badge`, `Button` / `ButtonRow`, `Checkbox`, `ConfirmButton`, `CopyButton`, `FormField` / `TextField`, `MonoText`, `SegmentedControl`, `EmptyState` / `LoadingState`, plus:
- `SectionNav` (`section-nav.tsx`) — a **short horizontal** strip of underline tabs for switching modes *within* a surface (the embedded Compose/Services toggle). Items take `icon` + optional `badge` and either `href` (routed, via `Link asChild`) or `onPress` (state-driven). There is deliberately **no rail variant**: a side list of destinations is what the project editor's layout exists to avoid, and a growing set of destinations belongs on the object it configures, not in a nav.
- `InlineNotice` (`inline-notice.tsx`) — left-accent state strip (title, optional body, optional actions that sit inline on wide layouts and wrap beneath the copy on narrow ones), `tone` `info` (default, `colors.command`) or `warning` (`colors.pending`). Use it wherever a message explains the content it sits above — **never** a modal or a scrim for that, which hides the very thing the message is about.
- `StatTiles` (`stat-tiles.tsx`) — icon-led count tiles **inside** a surface (fill-only, no border, auto-fit grid, zero values dimmed rather than hidden). Distinct from `StatusStatBoxes` (`org/status-stat-boxes.tsx`), which is the wider bordered label-first tile for page-level fleet numbers. Compose resource glyphs live in `src/components/icons/resource-icons.tsx`; compose nav glyphs in `org/compose-view-icons.tsx`.

**Shell polish:** shared patterns in `org-panel-styles.ts` (`pageTitle`, `toolbarBtn*`, `expandedSection`, `commandCodeBlock`, `statePanel`, `webPointer`). Org/admin sidebar brand via `TurboPanelLogo` (T mark only; full wordmark is website-only) + sub-nav rail; header eyebrow + borderless hover-tile account controls (`HeaderMenuTrigger`: org, user, notifications — leading icons sit in a 16px `triggerGlyph` slot matching the label line-height; native org switcher shows the display name truncated to `HEADER_ORG_NAME_MAX_CHARS` (20) plus chevron; native profile is a circular avatar with the user icon and optional unread badge, no chevron). Servers: status dots, zebra rows, expand cards. Metrics: collapsible chart groups + coverage bar. See `design-system/turbopanel/pages/servers.md`.


