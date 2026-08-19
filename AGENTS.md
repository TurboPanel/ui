# AGENTS.md

Expo web UI for TurboPanel. Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Project metadata / public naming

| Public name | GitHub | Internal term |
| --- | --- | --- |
| TurboPanel UI | [turbopanel/ui](https://github.com/turbopanel/ui) | `ui` |

Main product: [turbopanel/turbopanel](https://github.com/turbopanel/turbopanel) (TurboPanel Control Plane). **License:** AGPL-3.0-only. **Maturity:** **Private alpha**. README is product-facing; AGENTS.md is maintainer-facing. This repo is not deployed standalone — Caddy serves the control plane export.

## Documentation discipline

**Keep this file current.** When you learn something durable about the UI — instance API shapes, developer/diagnostic panels, fetch patterns, Expo constraints — add or update a note here alongside code changes.

- Prefer extending an existing section over orphan bullets.
- Record **why** when non-obvious.
- API contracts live in `src/lib/instance-api.ts`; mirror instance changes there and note breaking shapes here.
- Do not record secrets or environment-specific URLs as if they were universal.
- Remove or correct notes that prove wrong.

### SonarQube (CI-based analysis)

- Analysis runs in GitHub Actions (`.github/workflows/verify.yml`) with
  `SONAR_TOKEN` and `sonar-project.properties`
  (`sonar.projectKey=turbopanel_ui`, `sonar.organization=turbopanel`). The job
  runs lint + typecheck + **`pnpm test:coverage`** (Vitest v8 LCOV at
  `coverage/lcov.info`), then scans with
  `sonar.javascript.lcov.reportPaths=coverage/lcov.info`. The scan waits on the
  quality gate (`sonar.qualitygate.wait=true`); if the gate fails, the workflow
  stops.
- Vitest coverage `include` is `src/lib/**/*.ts` (`vitest.config.ts`).
  `sonar.coverage.exclusions` must keep Expo routes (`src/app/**`), UI chrome
  (`src/components/**`), and `**/*.tsx` out of the coverage denominator so
  untested screens do not fail Sonar-way **Coverage on New Code ≥ 80%**.
- **`sonar.sources` / `sonar.tests` / `sonar.test.inclusions`** must stay set in
  `sonar-project.properties` (and mirrored in vestigial
  `.sonarcloud.properties`). Tests are co-located (`**/*.test.ts` under `src`).
- **Automatic Analysis must stay off** for `turbopanel_ui` (SonarCloud →
  project **Administration → Analysis Method**). CI and Automatic Analysis
  cannot run together — Automatic Analysis enabled makes the CI scanner fail.
  There is no Sonar MCP `toggle_automatic_analysis` tool; change this only in
  the SonarCloud UI.
- Sonar-way **Coverage on New Code ≥ 80%** needs LCOV on CI. After switching
  from Automatic Analysis, reset **New Code** (Administration → New Code) so the
  baseline is not months of uncovered history, or the gate will fail even with
  fresh coverage reports.

### TypeScript style (SonarQube)

- Prefer **`String#replaceAll()`** over **`String#replace()` with a global regex** when replacing every occurrence of a substring (`typescript:S7781`).
- Use **`String.raw`** for string literals that contain backslashes so escapes stay readable and correct (`typescript:S7780`).
- Prefer **optional chaining** (`obj?.prop`) over `!obj || obj.prop` (`typescript:S6582`).
- Avoid **nested ternaries** — use `if`/`switch` or helpers (`typescript:S3358`).
- Extract helpers when **cognitive complexity** exceeds 15 (`typescript:S3776`).
- Sort strings with **`.sort((a, b) => a.localeCompare(b))`** (`typescript:S2871`).
- Mark React component props **`Readonly<{…}>`** (`typescript:S6759`).
- Do not leave **`TODO`** in code — use `Future:` in a normal comment (`typescript:S1135`).
- Avoid widening unions with bare **`string`** when a literal union exists (`typescript:S6571`).
- Web-only CSS (`position: 'sticky'`, `overflowX`, `backdropFilter`, …) is not in RN `ViewStyle` — cast via `as unknown as ViewStyle` (same pattern as `src/lib/glass.ts`). Do **not** use `as const` on those objects inside `StyleSheet.create` or `tsc` fails.

## At a glance

| Need | Go to |
|------|--------|
| **Any visual / UX work** | [Design system (ui-ux-pro-max)](#design-system-ui-ux-pro-max) — mandatory skill + MASTER/page workflow |
| **Agent skills** | [Agent skills](#agent-skills) — canonical `.agents/skills/` footprint |
| Stack / fonts / Tamagui | [Stack](#stack) |
| Auth, install, sign-up | [End-user auth & first-run install](#end-user-auth--first-run-install-self-hosted) |
| Org routes & shell | [Organization console](#organization-console-organizationid) |
| API helpers & contracts | [Instance API](#instance-api) + `src/lib/instance-api.ts` |
| Server state / queries | [Server state (React Query)](#server-state-react-query) + `src/lib/query-keys.ts` + `src/lib/queries/` |
| Admin surface | [Admin area](#admin-area-admin) |
| Commands / polling | [Command Pipeline UI](#command-pipeline-ui) + `src/lib/queries/commands.ts` |
| Deploy modes | [Build output & deployment](#build-output--deployment-dev-vs-prod) |
| Pre-commit / typecheck | [Testing & pre-commit](#testing--pre-commit) |

## Agent skills

Canonical skill footprint is **only** under `.agents/skills/` (pinned in `skills-lock.json`). Do not add packs under `.cursor/skills/`.

| Skill | Why retained |
| --- | --- |
| **ui-ux-pro-max** | Mandatory design workflow for console visuals — see [Design system (ui-ux-pro-max)](#design-system-ui-ux-pro-max) |
| **building-native-ui** | Expo Router / native UI patterns for this Expo app |
| **native-data-fetching** | Fetch / React Query / Expo Router loader guidance |
| **expo-deployment** | Web / store / hosting deploy paths for the Expo export |
| **expo-dev-client** | Development client builds when native modules are needed |
| **expo-cicd-workflows** | EAS workflow YAML for CI/CD |
| **eas-update-insights** | OTA update health when EAS Update is in play |
| **expo-module** | Expo Modules API if native module work is required |
| **upgrading-expo** | SDK upgrade guidance |
| **use-dom** | Expo DOM components for web-in-native incremental migration |
| **add-app-clip** | iOS App Clip target when that surface is needed |

Authored Tamagui config lives in `babel.config.cjs`, `src/lib/tamagui.config.ts`, and `src/lib/theme.ts` — never commit `.tamagui/` generated cache.

## Stack

- **Expo SDK 57** (React Native 0.86, React 19.2) — keep Expo module versions aligned with `pnpm expo install --fix`. Native `ios/` / `android/` are not checked in (CNG).
- **Tamagui** `^2.0.0-rc.26` — configured via `babel.config.cjs` (not `app.json` plugins); `reactCompiler` experiment is disabled to avoid conflicts with the Tamagui babel plugin.
- **React Query** `^5.90.14` — see [Server state (React Query)](#server-state-react-query) below.
- **Fonts** — `@tamagui/font-inter` OTF files loaded in `RootLayout` via `useFonts`; layout returns `null` until fonts are ready.

## Testing & pre-commit

| Command | Purpose |
| --- | --- |
| `pnpm typecheck` | `tsc --noEmit` — same gate as CI `verify.yml` and deploy |
| `pnpm lint` | Expo ESLint |
| `pnpm test` | Vitest once |
| `pnpm test:coverage` | Vitest + LCOV (`coverage/lcov.info`) — CI `verify.yml` runs this, then SonarCloud |

**CI:** `.github/workflows/verify.yml` runs lint, typecheck, `pnpm test:coverage`,
then a SonarCloud scan with `sonar.qualitygate.wait=true` (`SONAR_TOKEN` required).
Automatic Analysis must stay **off** for `turbopanel_ui`.

**Pre-commit** (`.githooks/pre-commit`): secret scan only (never skippable).
Lint/typecheck/tests are **temporarily disabled** in the hook until the
toolchain can run inside the Vagrant guest. Requires `core.hooksPath=.githooks`
(otherwise Git never runs the hook).

- **`pnpm install`** runs `prepare` → `scripts/ensure-git-hooks.sh`, which sets `core.hooksPath=.githooks` locally.
- Dev console `./console` / `ensureAllGitHooksPaths` also wires every co-located checkout.
- After a fresh clone, run `pnpm install` (or `sh scripts/ensure-git-hooks.sh`) before committing; confirm with `git config --local --get core.hooksPath` → `.githooks`.
- Lint/typecheck/tests still belong in CI/deploy and can be run manually with `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:coverage`.

## Server state (React Query)

All instance/server state goes through React Query. Do **not** add new `useEffect` + `useState` fetch caches or hand-rolled `setInterval` poll loops.

| Piece | Location |
| --- | --- |
| Query-key factory | `src/lib/query-keys.ts` (`queryKeys`) — hierarchical, org-scoped prefixes (`['org', orgId, …]`) so partial invalidation works |
| QueryClient factory | `createAppQueryClient()` in `src/lib/query-client.ts`; module-level instance in `src/components/app-providers.tsx` |
| Domain hooks | `src/lib/queries/*.ts` — one module per domain (servers, projects, environments, managed, …) |
| Mutations | `useApiMutation` in `src/lib/query-client.ts` — `{ ok, error }` shape; mutations use `retry: false` |
| 403 seam | `setForbiddenHandler` registered by `AuthProvider`; QueryCache/MutationCache `onError` routes `isForbiddenError` there. Prefer this over per-component `useForbiddenRecovery` |
| Transport / types | `src/lib/instance-api.ts` — components import **hooks** from `src/lib/queries/*`, not `fetch*` helpers |

**Conventions**

- Screens use `useQuery` / `useQueries` / mutation hooks; invalidate the narrowest correct key prefix in `onSuccess` — never thread a caller `refresh()` callback for server data.
- Sign-out calls `queryClient.clear()` so a second account never sees the previous cache.
- Show-once secrets (managed root/user passwords, generated variable secrets) stay in component state from the mutation result — **never** `setQueryData` them.
- Polling uses query `refetchInterval` (function form when conditional): servers list 30 s, **2 s while any listed host is Initializing**; update-status while `status === 'updating'`; commands via `useCommandsBatch` (`COMMAND_POLL_MS` in `src/lib/queries/commands.ts`); managed status only while `provisioning` / `applying`; metrics cadence 1 h/6 h → 60 s, 24 h → 300 s, longer → `false`. An empty fleet is idle (30 s) — do not treat a self-hosted empty org as “waiting for the colocated host.”
- Containers on Project Overview: `refetchInterval: false` — refresh only on explicit **Refresh** or after a tracked command reaches terminal status.
- O(1) fleet reads: one `useOrgServers` / one batch update-status query — never per-server queries or `fetchServerCell` with an interval on overview.
- `useCan` remains a display hint; server 403s remain authoritative via the global forbidden seam.
- Manage-gated reads that must not sign the user out (e.g. org default environment) catch `isForbiddenError` inside `queryFn` and return a fallback so the global handler is not invoked.

## Design system (ui-ux-pro-max)

This repo is the **signed-in product console** (org + admin + install/sign-in), not the public marketing site. Visual work must follow the installed **ui-ux-pro-max** skill and the persisted TurboPanel console design system. Do not invent a parallel look from generic SaaS defaults or from `~/website`.

### This repo vs marketing site (`~/website`)

| | **ui** (this repo) | **website** (`~/website`) |
| --- | --- | --- |
| Surface | Org console, admin, install/sign-in product UI | Marketing pages, landing/heroes, docs chrome, pricing/roadmap |
| North star | Dark-first **OLED** ops console, dense tables | Fast, trustworthy, **light-first** marketing + readable docs (dark mode supported) |
| Design system | `design-system/turbopanel/` | `design-system/turbopanel-website/` |
| Skill path | `.agents/skills/ui-ux-pro-max/` | `.agents/skills/ui-ux-pro-max/` |
| Tokens | `src/lib/theme.ts` (Tamagui: `colors`, `spacing`, `layout`) | `--tp-*` in `src/app/globals.css` |
| Stack search | `--stack react-native` | `--stack nextjs` |

Shared brand cue only: accent green **`#3dd68c`**. Do **not** copy light-first marketing layout, Plus Jakarta display rules, or website Master into the console — and do not apply OLED console density / Tamagui patterns to the marketing site.

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
| Cursor rule | [`.cursor/rules/ui-ux-pro-max.mdc`](.cursor/rules/ui-ux-pro-max.mdc) |
| Master (global SoT) | [`design-system/turbopanel/MASTER.md`](design-system/turbopanel/MASTER.md) |
| Page overrides | `design-system/turbopanel/pages/<page>.md` (page **wins** over Master) |
| Runtime tokens | `src/lib/theme.ts` — no one-off hex in components |
| Liquid glass | `src/lib/glass.ts` + `src/components/glass/glass-surface.tsx` (frosted chrome; iOS 26+ `expo-glass-effect`) |
| Shared panel patterns | `src/components/org/org-panel-styles.ts` |

**Page overrides that exist today** (do not invent others): `sign-in.md`, `overview.md`, `manage.md`, `organizations.md`, `servers.md`, `datacenters.md`, `server-detail.md`, `server-metrics.md`, `network.md`, `projects.md`, `project-create.md`, `managed-services.md`, `variables.md`, `service-settings.md`, `storage.md`. If no page file exists for a surface, follow Master only; add a page override when that surface needs durable exceptions.

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

- Dark-first **OLED** console; dense ops tables
- Interactive chrome (nav, CTAs, toolbar) follows runtime via `chrome.*`: Workers / HA → blue `#3366cc`, Deno → green `#3dd68c`; **online / live status stays green** (`colors.green` / `colors.accent`)
- Soft elevation / hairline borders + restrained **liquid glass** on shell chrome — **not** light SaaS, purple gradients, cyberpunk neon, or iridescent aberration
- Design dials already chosen: variance ~4, motion ~4, density ~8 (dashboard)
- Tokens only from `src/lib/theme.ts` (`colors` + `chrome`) and `src/lib/glass.ts` — no parallel hex systems
- **Platform copy:** user-facing “Workers / Cloudflare / edge” → **TurboPanel High Availability** (`HA_PRODUCT_NAME` in `src/lib/platform-copy.ts`). Never bare “High Availability” or “HA” in UI copy. The org mesh product is **TurboFabric** (`TURBOFABRIC_PRODUCT_NAME`) — never “tp0 fabric”, “which WireGuard network should this container join?”, or “the WireGuard mesh”. Backend identifiers unchanged.

### Anti-patterns / do-not

- Skip the skill and freestyle a purple/indigo SaaS or cream+serif “AI default” look
- Apply `~/website` light-first marketing / docs chrome / Plus Jakarta hero rules to the console
- Raw hex in components when a `theme.ts` token exists
- Ignore a page override when one exists for the surface you’re editing
- Silent `--persist --force` of Master (discards curated decisions)
- Decorative card stacks, emoji-as-icons, status conveyed by color alone
- Copy website search project name (`TurboPanel Website`) or `--stack nextjs` into this repo

### UI overhaul roadmap (web)

| Phase | Scope | Status |
|-------|--------|--------|
| **1** | Design system pages, compose create wizard + base panel, shell polish, TurboPanel High Availability terminology, variables presets | **Shipped** |
| **2** | Compose flow rail + wizard step indicator, project variables panel, managed provision API wired, environment-scoped managed connection UI, Expo SDK 56.0.16 | **Shipped** |
| **3** | TurboFabric mesh console, read replicas, move services between servers, managed DB user provisioning, daemon `managed.provision` command | **Partial** — TurboFabric is the only mesh page (enable + relay table + Apply; the old Links page is gone); **managed DB user provisioning shipped for Postgres** (create wizard + managed project panels); remaining items planned |

**Compose parity (docker-compose projects):** service settings panel, variable deploy flags (`isLiteral` / build / runtime), hosting proxy toggles, optional health-check policy (`disabled` default — compose/`image` HEALTHCHECK is enough when present; `warn`/`required` are opt-in gates), storage registry UI, project principals, org/server resource limits API — see `design-system/turbopanel/pages/service-settings.md`.

**Shell polish (Phase 1):** shared patterns in `org-panel-styles.ts` (`pageTitle`, `toolbarBtn*`, `expandedSection`, `commandCodeBlock`, `statePanel`, `webPointer`). Org/admin sidebar brand via `TurboPanelLogo` (T mark only; full wordmark is website-only) + sub-nav rail; header eyebrow + borderless hover-tile account controls (`HeaderMenuTrigger`: org, user, notifications — leading icons sit in a 16px `triggerGlyph` slot matching the label line-height; native org switcher shows the display name truncated to `HEADER_ORG_NAME_MAX_CHARS` (20) plus chevron; native profile is a circular avatar with the user icon and optional unread badge, no chevron). Servers: status dots, zebra rows, expand cards. Metrics: collapsible chart groups + coverage bar. See `design-system/turbopanel/pages/servers.md`.

## End-user auth & first-run install (self-hosted)

- **Install** — `/install` when `needsInstall`. Step 1: host root or sudo user → `POST /install/bootstrap` (no cookies; UI reveals superadmin fields). Step 2: same host creds + superadmin email/password → `POST /install` → superadmin session → `/<organizationId>/overview`. `useCompleteInstall` optimistically clears `needsInstall` / `isInstallMode` before navigation. The install screen must not redirect to `/sign-in` after a successful complete (that raced AuthGuard).
- **AuthGuard** (`src/app/_layout.tsx`, logic in `src/lib/auth-guard.ts`) — always keep the root `<Stack />` mounted and render `<Redirect />` alongside it when a gate applies. Replacing Stack with Redirect alone leaves `useSegments()` empty so signed-in users loop on `/welcome` (`Maximum update depth exceeded`) right after install.
- **Control-plane targeting** (`src/lib/control-plane.ts`) — user sessions stay **HttpOnly cookies** (`credentials: 'include'`). There is no user-session Bearer. **Same-origin web** (production, or `__DEV__` behind Caddy `:8443` / `:8880`) keeps relative `/api` and has no picker or account switcher. **Standalone Expo web** (`__DEV__` + Metro origin, typically `:8081`) must **not** call the API — `/connect` is a static “open via Caddy” interstitial so Metro does not retry-loop. **Native** (iOS/Android) prefixes `resolveApiUrl` with the active origin; cookies live in the platform jar (one session per host). `/connect` picks **TurboPanel High Availability** (`https://turbopanel.app`) or a self-hosted URL; `needsInstall` tells the operator to finish setup in a browser on the host (no PAM install from the phone). Account metadata (origin, email, runtime) is stored without tokens; the header menu switches origins and calls `queryClient.clear()`. `pnpm start` / `ios` / `android` may prompt for `EXPO_PUBLIC_CONTROL_PLANE_URL` (written to gitignored `.env.development.local`); `pnpm web` and the systemd Expo unit do not.
- **Sign-up** — `/sign-up` when `isSignupEnabled` (from `GET /install/status`). Calls `POST /auth/sign-up`; no session is returned — user is redirected to `/sign-in` on success. Route is guest-only (authenticated users are redirected to dashboard). Not available when `needsInstall` is true. `sign-up.tsx` inlines `validatePassword` and `checkPwnedPassword` (no shared validation package). Pwned-password check uses `crypto.subtle.digest('SHA-1', …)` against `https://api.pwnedpasswords.com/range/{prefix}` with `Add-Padding: true` and a 5000ms timeout; fails open on error. The "Learn more" link hardcodes `https://turbopanel.io/docs/security/password-safety` — no `DOCS_BASE_URL` env var.
- **Sign-in** — `/sign-in` after install; superadmin **email** + password only (body `{ email, password }`; host accounts cannot sign in). Session has no `username` field — labels use `session.email`. Layout: centered column via `AuthScreenShell` (`src/components/auth/auth-screen-shell.tsx` + `auth-form-styles.ts`), form `maxWidth` 400 — **TurboPanel T mark** and **Sign In** title on one row above the form panel (mark left, title right-aligned; accent top edge on the **liquid-glass** panel via `GlassSurface`), `© {year} TurboPanel` copyright below. Shell backdrop (`AuthScreenBackground`): LinearGradient wash + tiled dashed SVG grid + vignette (`auth-grid-layer`) + 2×2 Reanimated accent streaks on random grid lines via shared values (skipped when reduced motion). Fields use floating labels (`AuthFloatingField`): resting label inside the field, shrinks to the top on focus/value; password toggle is eye / eye-slash icons (`auth-eye-icons.tsx`). **Accent by runtime** (`src/lib/auth-accent.ts` + `GET /api/client/v1/status` `runtime`): Workers / HA → blue `#3366cc`, Deno self-hosted → green `#3dd68c`. Bootstrap stores `controlPlaneRuntime`, persists it in `sessionStorage`, and calls `applyConsoleChromeRuntime` so signed-in `chrome.*` tokens resolve via CSS variables on web (hydrated on refresh before paint). Online status stays `colors.green`. Loading spinners (root AuthGuard + org layout) use `authSpinnerColor` — remembered runtime on refresh, muted only when unknown; never hardcode `colors.accent` on full-screen loaders. Sign In CTA spinner uses `onAccent`. Tokens in `src/lib/theme.ts` + `src/lib/glass.ts`; page override in `design-system/turbopanel/pages/sign-in.md`.
- **Dashboard** — `/welcome` after install/session restore: last or only org opens Overview (`defaultOrgDashboardHref`); otherwise `/organizations`. The header **View all organizations** action goes straight to `/organizations` and does not auto-leave.
- Session/install API shapes live in `src/lib/instance-api.ts` (`needsInstall`, `organizationId`).

The developer console has been moved to the [turbopanel/dev](https://github.com/turbopanel/dev) terminal console (`src/` in that repo).

## Project metadata

GitHub repository: [turbopanel/ui](https://github.com/turbopanel/ui). Package name: `@turbopanel/ui` (`package.json`).

Identifiers for Cloudflare and Expo deployments:

- `app.json` `slug`: `ui` — Expo project slug for web/EAS builds (`@turbopanel/ui`).
- `app.json` native IDs: iOS `ios.bundleIdentifier` and Android `android.package` are both **`app.turbopanel`** (required for GitHub-triggered EAS builds; reverse-DNS of [turbopanel.app](https://turbopanel.app)). Deep-link scheme is `turbopanel`. iOS `ITSAppUsesNonExemptEncryption` is `false` (HTTPS / standard APIs only). **GitHub iOS builds are non-interactive:** run one local `eas build -p ios --profile development` (or `eas credentials -p ios`) plus `eas device:create` so EAS has an Ad Hoc cert/profile before CI can sign `distribution: "internal"`.
- `wrangler.jsonc` top-level `name`: `ui` — Cloudflare Worker resource name; production deploy uses `env.live.name` `ui`.

## Build output & deployment (dev vs prod)

The UI is never installed as a standalone service tree — the **instance** repo's Caddy serves it, and the **daemon** installs its build output. Two modes (`TURBOPANEL_UI_MODE` on the instance):

- **Development** (`dev`) — `turbopanel-ui.service` runs the Expo web dev server on `:8081` (installed by the daemon `instance-launch` role, running as the **dev user**). Caddy reverse-proxies non-`/api`/`/ws` traffic to **`127.0.0.1:8081`**. The unit sets `NODE_OPTIONS=--dns-result-order=ipv4first` so Node 24 `listen("localhost")` binds IPv4 (default is `[::1]`, which Caddy and Vagrant tunnels never hit — spinner stays on “Starting Expo dev server…”). Dev logs go to **`/var/log/turbopanel/ui`** (dev-user-owned).
  **Fast Refresh on Vagrant:** host saves on VirtioFS / 9p do not notify guest inotify, so Metro’s Linux `FallbackWatcher` never sees them (a full browser reload still works because Metro re-reads files). `metro.config.js` installs a poll watcher (`scripts/metro-virtfs-poll-watch.cjs`) when `/proc/mounts` shows those types. Override with `TURBOPANEL_METRO_POLL=1` (force) or `=0` (disable). Tamagui style extraction is off in development so Fast Refresh can apply. After changing Metro config, restart `turbopanel-ui`. Open the signed-in console via Caddy (`:8443` / `:8880`); Metro `:8081` is forwarded for native / Expo Go (same-origin cookies still will not work on the Metro origin). Web HMR is `/hot` on the Caddy origin.
- **Production** (`static`) — `pnpm export` produces the static web bundle; the daemon `ui-build` role publishes it to the FHS path **`/opt/turbopanel/share/ui`** (instance `TURBOPANEL_UI_ROOT` default). Caddy serves those files directly with SPA fallback and `turbopanel-ui.service` is stopped/disabled. Production runs as `tpctrl:tp`.

Both modes route through the single instance Caddy entrypoint; there is no separate `turbopaneld.service` or FHS tree owned by this repo. Canonical paths/units live in `../turbopanel/AGENTS.md` (Caddy + UI env vars) and `../turbopaneld/AGENTS.md` (Filesystem layout & path model).

## Organization console (`/<organizationId>/*`)

Main product shell for signed-in users. Web keeps the sidebar + narrow-viewport drawer (`org-shell.tsx`); iOS/Android use `org-shell.native.tsx` with `OrgTabBar` (Overview, Projects, Servers). `ORG_TAB_AREA_IDS` is the native tab set; Managed / Network / Access / Workspaces / Admin / Pending keys remain deep-link-only on native for now. **Manage Organization** is not a sidebar area — reach it from the header org switcher **Manage** button, a gear on `/organizations`, or a deep link.

### Layout

- `src/app/_layout.tsx` — root Stack; `[orgId]` is a single console (`dangerouslySingular` + `animation: 'none'` + no back gesture) so switching orgs does not stack a swipe-back history
- `src/app/[orgId]/_layout.tsx` — auth guard + nested Stack inside `OrgShell` (tab overviews have no stack animation; detail routes keep platform push/pop)
- `src/components/org/org-shell.tsx` — web shell (sidebar + narrow-viewport drawer); iOS/Android override is `org-shell.native.tsx` (header + bottom `OrgTabBar`)
- `src/components/org/org-shell-content.tsx` — nested Stack (or `Slot`) plus native tab-overview pager overlay; `OrgScreenScroll` (`org-screen-scroll.tsx`) owns pull-to-refresh
- `src/lib/pull-to-refresh.tsx` — `PullToRefreshProvider` + `usePullToRefresh(handler)` for screens (Overview / Servers / Projects / Manage; reuse elsewhere)
- `src/components/org/org-tab-bar.tsx` — native Overview · Projects · Servers tabs (derived from `ORG_TAB_AREA_IDS`)
- `src/components/org/org-tab-pager.tsx` — web no-op; `org-tab-pager.native.tsx` is a Reanimated pager between those tabs **only** on each tab's overview path (`isOrgTabOverviewPath` — not server/project detail or Datacenters). Content follows the finger; snap does not wrap. Nested horizontal tables keep their own scroll (`cancelsTouchesInView(false)` + directional `activeOffsetX`). Root `src/app/_layout.tsx` wraps the tree in `GestureHandlerRootView` so the detector is recognized.
- `src/components/org/org-sidebar.tsx` — area nav + sub-routes for the active area (web)
- `src/components/org/org-header.tsx` — page title, user label, sign out (web glass); native override is `org-header.native.tsx` (plain fill + bottom hairline — no GlassView rim)
- Header notifications: web keeps a dedicated bell (`HeaderNotificationsSegment`); native folds notifications into the profile avatar (`AccountAvatar` + unread badge only when `useUnreadNotificationCount() > 0`, no chevron). Compact menus use `HeaderMenuOverlay` — org from the top, account/notifications from the right (never bottom sheets). Empty panel body is `NotificationsPanelBody` until a notifications API exists (`src/lib/notifications.ts`).
- `src/components/organization-switcher.tsx` — header org menu: searchable scrolling list (2+ orgs), sticky **Manage** / **New** footer (never clipped under the list), **View all organizations** → `/organizations`. Switching an org opens Overview via `replaceOrganization` (no previous-org back stack). Web shows the full name (ellipsis inside `HEADER_TRIGGER_MAX_WIDTH`). iOS/Android show `truncateDisplayName` (20 characters + `…`); the menu and `accessibilityLabel` keep the full name.
- `src/components/org/organization-switcher-screen.tsx` — full switcher at `/organizations`. Filter field, A–Z list with current org pinned, per-row gear → Manage, **New** create modal. Same Overview landing as the header menu (`replaceOrganization`). Helpers in `src/lib/organization-switcher.ts`. `/welcome` is the signed-in home hop (preferred org → Overview, else this page).
- `src/components/org/organization-form-section.tsx` — Manage view/edit form (name; ID + created date; managers save via `PATCH /organizations/:id`)
- `src/components/org/overview-section.tsx` — org Overview: hairline status tiles (`StatusStatBoxes` — Servers · Cores · RAM from `src/lib/fleet-capacity.ts`; Servers shows a green online count plus offline / initializing suffix)
- `src/components/org/pending-keys-section.tsx` — unused registration keys (Servers sidebar **Pending keys**)
- `src/components/org/manage-section.tsx` — org Manage Organization: organization record (view / rename); not a sidebar area
- `src/components/org/workspace-switcher.tsx` — on the Projects screen; compact **Filter** control (defaults to **All workspaces**), links to Manage / Create workspace
- `src/lib/workspace-scope.ts` / `src/lib/workspace-scope-context.tsx` — project filter scope (`?workspaceId=` + remembered selection); not a top-level nav area. Defaults to **All workspaces** (even with a single user workspace); last choice may be restored from localStorage.
- `src/lib/org-navigation.ts` — area registry (`ORG_AREAS`); add entries + routes together; `ORG_TAB_AREA_IDS` is the native bottom-tab set; `isOrgTabOverviewPath` / `orgTabHref` / `adjacentOrgTabHref` / `replaceOrganization` for native tab pager + org switch

### Areas (routes)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/<orgId>/overview` | `overview-section.tsx` | Org glance — hairline status tiles (Servers · Cores · RAM; Servers = green online + offline suffix) |
| `/<orgId>/servers` | `servers-overview-section.tsx` | Fleet Detail/Summary — batch update, row/tile opens control panel |
| `/<orgId>/servers/[serverId]` | `server-detail-section.tsx` | Server control panel (Overview, Control, Time, Network, Metrics tabs) |
| `/<orgId>/servers/datacenters` | `datacenters-overview-section.tsx` | Org datacenter inventory (private subnets). A datacenter is a routing domain of one or more mutually routable subnets. Empty list + **+ Datacenter** (no auto-opened create form). **+ Datacenter** when ≥1 server reports a private IP; opens `/servers/datacenters/new` |
| `/<orgId>/servers/datacenters/new` | `datacenter-form-section.tsx` | Create form (name, description, server + IP dropdowns → first subnet). After create, opens datacenter detail |
| `/<orgId>/servers/datacenters/[datacenterId]` | `datacenter-detail-section.tsx` | Name/description; Subnets (rows + Add subnet); Routing (address preference); member pins (server + IP dropdowns, both families); TurboFabric relays; timezone; two-press delete when empty |
| `/<orgId>/servers/keys` | `pending-keys-section.tsx` | Unused registration keys (not bound to a server). Owner-only; two-press delete. Reached from the Servers sidebar. |
| `/<orgId>/servers/settings` | `server-timezone-settings-section.tsx` + `server-host-defaults-settings-section.tsx` + `server-capacity-settings-section.tsx` | Org default timezone, host defaults (SSH / NTP / TurboFabric preference), server seat capacity (`maxServers`) |
| `/<orgId>/servers/tls` | `tls-overview-section.tsx` | Org TLS certificate library (upload / self-signed; LE seam pending) |
| `/<orgId>/network` | `network/network-overview-section.tsx` | Hub linking Datacenters, TurboFabric, Addresses, and Docker networks (private subnet CRUD lives on Datacenters) |
| `/<orgId>/network/sites/[datacenterId]` | redirect | Legacy bookmark → `/servers/datacenters/:id` |
| `/<orgId>/network/addresses` | `network/network-addresses-section.tsx` | Org address pool (`public` / `datacenter`) |
| `/<orgId>/network/docker` | `network/network-docker-section.tsx` | Docker external network registry for compose |
| `/<orgId>/network/fabric` | `network/network-fabric-section.tsx` | TurboFabric opt-in mesh + relay table + Apply (not required for standalone Docker) |
| `/<orgId>/projects` | `projects-overview-section.tsx` | Projects list; optional `?workspaceId` from the filter (omit = **All workspaces**) |
| `/<orgId>/projects/new` | `project-create-section.tsx` | Details: name, description, existing/new workspace → empty project; type chosen on setup |
| `/<orgId>/projects/settings` | `default-environment-settings-section.tsx` | Org default environment name (`GET`/`PUT /organizations/:id/default-environment`) |
| `/<orgId>/projects/[projectId]` | tabbed project shell (`project/_layout` + tabs) | Header breadcrumb: **Projects ›** type glyph (`ProjectTitleIcon`) + project name + compose **Project · environments** scope chips. Overview defaults to **Project** compose at `/overview` (no `?env=`). Selecting an environment uses `/environments/:environmentId` (same Overview UI; that env highlighted, not Project). Networking / Storage live in the environment scope-chip **settings gear** (not section chips). Bare `/environments` redirects to Overview. Shell environment selector is for managed non-Overview tabs. Unconfigured projects redirect to `/setup`. Service detail remains at `/services/:id`. |
| `/<orgId>/projects/[projectId]/setup` | `project-setup-section.tsx` | Resumable type / catalog selection after empty create |
| `/<orgId>/projects/[projectId]/environments/[environmentId]` | `ProjectOverviewTab` | Overview with that environment selected (path-based; no query) |
| `/<orgId>/managed` | `managed/managed-overview-section.tsx` | Org-wide managed services table (`GET /organizations/:id/managed`); engine / status / server filters; row opens the managed project detail |
| `/<orgId>/managed/settings` | `managed/managed-defaults-settings-section.tsx` | Org defaults inherited by managed databases — client TLS mode and shared-ProxySQL listener ports (`GET`/`PUT …/managed-defaults`, manage-gated) |
| `/<orgId>/access` | `access-overview-section.tsx` | Permission grant management (`GET/POST/DELETE /api/client/v1/access`) |
| `/<orgId>/manage` | `manage-section.tsx` | **Manage Organization** — view name / ID / created date; managers can rename (`PATCH /organizations/:id`). Reached from the header org switcher **Manage** button or a gear on `/organizations`, not the sidebar |
| `/<orgId>/workspaces` | `workspaces-overview-section.tsx` | Workspace CRUD (reached via switcher **Manage workspaces**, not the sidebar) |
| `/<orgId>/workspaces/[workspaceId]` | `workspace-detail-section.tsx` | Workspace detail + projects in workspace |

### Adding a new organization area

1. Add the area (and sub-routes) to `ORG_AREAS` in `src/lib/org-navigation.ts`
2. Create `src/app/[orgId]/<area>/<subroute>.tsx` route wrappers
3. Create section components under `src/components/org/`

### Environments (project Environments tab)

Managed environments use the shell **Environments** tab (`project-environments-section.tsx`). Compose projects have no Environments section tab — env work lives under the selected environment chip; Networking / Storage are reached via the environment-scope settings gear on `ProjectScopeSelector` (`EnvironmentSettingsPanel` → `EnvironmentDetailBody` for hosting), not standalone section chips. The shell environment selector keeps the active environment across managed non-Overview tabs; compose Overview owns the unified chip strip (path `/environments/:id` selects that env).

**Overview Compose panel** (`compose-tabs.tsx` → `ComposeServicesTab` + `overview-environments-panel.tsx`):

- **Surface tabs inside the editor chrome:** one bordered compose surface hosts underline **Overview · Compose · Services** (`ComposeSurfaceSectionTabs` — not a shell strip above the surface). Paths: `/overview`, `/compose`, `/services` (Project); `/environments/:id`, `…/compose`, `…/services` (environment). Scope chips (**Project · environments**) stay in the project header and **keep the active surface tab** when switching. No Edit button; no Diagram/YAML toggle.
- **Unsaved draft session:** `ComposeDraftProvider` (under `ProjectProvider`) holds per-scope draft YAML + full document (`compose-draft-context.tsx`) so switching Overview ↔ Compose ↔ Services **does not wipe** in-progress edits (route remounts rehydrate from the store). Compose/Services stay dual-bound: YAML edits flush into the shared draft when opening Services; Services form edits update draft + visible YAML for Compose.
- **Overview** (`ComposeSavedView`): inventory strip + topology diagram (`ComposeGraphView`); optional running-service status when the environment is started. When the draft is dirty, Overview defaults to **Proposed** (unsaved) topology with a **Proposed | Saved** toggle to compare the last save, and a **Save** control in the surface header. Blank compose shows empty state.
- **Compose** / **Services** (`ComposeBasePanel` + `sessionKey`): YAML editor or visual forms. **Save** appears only while dirty (hidden when clean); stays briefly as “Saving…” during persist.
- **Set Default Project Server (Optional)** stays in Project settings (gear). Delete controls live only in the scope-chip settings gear — compose projects have **no** header trash (managed projects keep the header trash). Lifecycle **Preview ▾ / Deploy / Redeploy ▾ / Start / Stop / Refresh / Destroy** and env add live below via `OverviewEnvironmentsPanel` when an environment is selected. Env-only server pin appears when the selected env has no effective server. Status is loaded with one `fetchContainers({ environmentId })` per environment on mount / when the environment-id list changes, and again on explicit **Refresh** or after a tracked command reaches a terminal status — **no auto-poll / `refetchInterval`**.
- **Scope banner** (`ComposeScopeBanner` in `src/components/org/project/compose-scope-banner.tsx`): **Project** scope and **inheriting** environments have no banner. Opening **Compose** on an inheriting environment starts a blank overlay. Banner appears only when the environment has overrides (**Clear overrides**, two-press).
- **Project vs environment selection:** Overview Project compose is `/overview` (no query). Selecting an environment chip navigates to `/environments/:environmentId` (or `…/compose` / `…/services` if already on those tabs). Post-setup navigation opens `/overview`. While Project is selected, Networking / Storage settings rows are environment-scoped only; context may still keep a concrete `selectedEnvironmentId`. Project mode hides lifecycle actions.
- **Preview Deployment** (`PreviewDeploymentModal` in `src/components/org/project/preview-deployment-modal.tsx`): lifecycle **Preview ▾** opens inspect (**Merged compose** primary / **Prepared compose** via caret). **Deploy** / **Redeploy** / **Cacheless redeploy** open confirm (Prepared default) then enqueue. Not shown for project-level compose editing or lifecycle Start/Stop. Titles **Compose Preview** vs **Confirm Deployment**. **Merged** — `mergeComposeOverlay(project, environment)` with service `x-turbopanel` kept for audit (placement remains on `environment.server_id`, never re-written into YAML); **Prepared** — `useDeployPreview` fetch-on-open (no auto-poll). Confirm enqueues deploy (`confirmLabel` matches Deploy / Redeploy / Cacheless redeploy). The Prepared view (`deploy-preview-panel.tsx`) shows the compiled runtime `compose.yaml` (`role: 'runtime'`) the daemon writes on the host, plus `.env` (non-secrets) and `secretPlan[]` file paths, plus one YAML block per `preview.servers[]` when the environment is scheduled across servers — not a project/environment/platform `-f` chain. Older layer roles may still appear in the payload and must not be presented as what the daemon runs. `ui/src/lib/compose/index.ts` mirrors instance merge semantics for the client-side **Merged compose** view; the instance's `turbopanel/src/lib/compose/merge.ts` remains the single source of truth for Compose Spec merge behavior (sequence append/dedup rules, `!reset`/`!override` tags, full-replace attributes) — keep the two in sync when merge rules change.
- **Scope-chip settings** (`ProjectSettingsPanel` / `EnvironmentSettingsPanel` in `src/components/org/project-settings-area.tsx`, opened from the gear on each `ProjectScopeSelector` chip): full controls live in the dropdown panel (not below compose). **Project gear:** quiet **Add Server / Add Variable / Add System user** chips plus Workspace, container naming, and Danger → Delete project (`ProjectDeletePanel`). Container naming is a single **Keep original container names** toggle (default Off = rename to service UUIDs; On = `options.containerNaming: 'custom'`) with a warning that keeping names disables rolling updates. **Environment gear:** **Add Server / Add Network / Add Storage** chips plus Danger → Delete environment (two-press `useDeleteEnvironment`; disabled with a pointer to Project settings (gear) when only one environment exists). `?hostingId=` auto-opens the environment settings panel.
- **Preview ▾ / Deploy / Redeploy / Start / Stop / Refresh / Destroy** — refined quiet toolbar buttons (not large primary chips). **Preview ▾** inspects compose without enqueueing. **Deploy** (no host-deployed containers) and **Redeploy ▾** (deployed) open **Confirm Deployment** then `deployEnvironment` (optional `{ noCache: true }` for **Cacheless redeploy**). **Start** appears only when deployed-but-stopped and calls `runEnvironmentLifecycle(id, 'start')` with no preview modal. Stop keeps files/data. Destroy is two-press confirm (`stopEnvironment`) and removes containers **and their data volumes**. Deploy ack conflicts surface plain-language copy pointing at the Environments tab.
- **Delete** — compose **settings gear → Danger** (`organization:own`): with more than one environment, two-press confirm deletes the selected environment; project delete uses `ProjectDeletePanel`. Managed projects keep the header trash control. Name validation via `validateEnvironmentName` for Add.
- Lifecycle / deploy / destroy commands share a **single** `COMMAND_POLL_MS` timer (`useEnvironmentCommands`), never one timer per environment.

- `ProjectEnvironmentsSection` loads `fetchVisibleEnvironments(projectId)` and renders one active environment at a time.
- **Tabs** (`EnvironmentTabs`) only render when there is **more than one** environment; with a single environment the tab bar is hidden and the active environment name shows in the toolbar.
- **Default environment:** when a project has zero environments and the viewer has `organization:own`, the section auto-provisions a single environment named from the org default (`fetchOrgDefaultEnvironment`, falling back to `Production`) (once per project, guarded by a `useRef` so React StrictMode's double effect invocation does not create duplicates). The managed auto-provision path uses the same org default. Non-owners just see an empty-state message.
- **Rename** (`updateEnvironment(id, { displayName })`), **New environment** (`createEnvironment`), and **Delete** (`deleteEnvironment`, two-press confirm, hidden when only one environment remains) are all inline in the toolbar and gated by `organization:own` (display hint; server enforces 403).
- The active environment renders `EnvironmentDetailBody` (exported from `environment-detail-section.tsx`) with `embedded` set, which hides the redundant "Environment" meta panel but keeps **required server dropdown** (`EnvironmentRecord.serverId`), merged runtime compose (includes service `x-turbopanel`), **Preview ▾** + **Deploy** (inspect vs confirm via `PreviewDeploymentModal` — not an always-visible preview panel), hostnames + TLS + **bind** (`public` / `datacenter` / `local`) + optional public **`ipId`** picker (when bind is public), **per-hosting variables** (embedded `VariablesSection` with `{ hostingId }` after the hosting row is saved), **container status**, and environment-scoped variables. **Compose overlay** is hidden when embedded for Settings Networking (`showComposeOverlay={false}`) — environment overlays are edited on the surface **Compose** / **Services** tabs at `/environments/:id/compose` (and `/services`); **Clear overrides** only when overrides exist. Switching tabs remounts the body via `key={environmentId}`. Compose projects expose **Keep original container names** (`options.containerNaming`: `uuid` default vs `custom`) under Project settings (gear).
- **Server** is a required dropdown on the environment: pick one whole connected server via `updateEnvironment({ serverId })` — not compose, and not at deploy time. Deploy stays disabled until a connected server is selected. Different environments may select different servers. Compose must not carry `x-turbopanel.placement` (instance validation rejects it; UI `stripComposePlacement` is an input-sanitization path only).
- `EnvironmentDetailSection` remains as a thin wrapper (heading + `EnvironmentDetailBody`) for embedded Environments-tab use.
- **Container status** is shown inline in the active environment's Containers panel (`ContainerStatusBadge`, Postgres-backed `fetchContainers({ serviceId })` per service — never DO reads), so no separate environment page is needed to see it.
- **Managed engine versions:** operators pick a **version series** (`18`, `9.7`, `12.3`) plus a base-OS **variant** (Alpine / Debian / Oracle Linux 9 / UBI) — never a raw OCI tag. `src/lib/managed-releases.ts` mirrors the control-plane catalog (`turbopanel/src/lib/managed/releases.ts`); `MANAGED_SERVICE_CATALOG` `defaultImage` / `allowedImages` derive from it, and `managed-releases.test.ts` pins the literal set. `ManagedVersionPicker` (`managed/managed-version-picker.tsx`) is the **only** place a series is chosen: it appears on the managed setup panel and sends `engineSeries` / `imageVariant`. A cluster's series is immutable afterwards (**422** `managed_series_immutable`), so the Settings panel's base-image picker offers only other variants of the running series (`managedVariantImagesForImage`) and the Status header shows `PostgreSQL 18 · Alpine` from `detail.release` (`managedReleaseSummary`). Adding a series is a three-repo change — control-plane catalog, daemon allowlist, this mirror.
- **Managed client TLS (SSL mode):** `src/lib/managed-ssl.ts` mirrors the control-plane policy (`turbopanel/src/lib/managed/ssl.ts`) — six modes (`disable` → `verify-full`), platform fallback `require`, and pure helpers (`resolveManagedSslMode`, `managedSslRequiresTls`, `managedSslVerifiesServer`, `managedSslDsnParam`, `describeManagedSslPolicy`), pinned by `managed-ssl.test.ts`. It is a **client-facing** policy at the shared ProxySQL listener; the listener ↔ engine leg is always encrypted, so never present this as "turn on database TLS". `ManagedSettings.ssl` is `{ mode?: ManagedSslMode }` — **omitting `mode` is what keeps a service inheriting**, so the settings form must send `{}` rather than the resolved value. `ManagedSslModePicker` (`managed/managed-ssl-mode-picker.tsx`) is the only picker: it renders the inherit row only when given an `inheritLabel` (`managedSslInheritLabel(orgDefault)` → e.g. `Organization default (Require)`). Per-service selection lives in `ManagedSettingsPanel` (`organizationSslMode` comes from detail `ssl.organizationDefault`); org-wide default lives at `/<orgId>/managed/settings` (`ManagedDefaultsSettingsSection`, manage-gated), which invalidates `queryKeys.org(orgId).managed.all` on save because every managed detail response carries a resolved `ssl` block. The Connect panel renders the effective policy from `describeManagedSslPolicy` (DSN parameter · plaintext refused/allowed · which layer set it) and points at the org CA download when the mode verifies — never a hardcoded `sslmode=verify-full` line.
- **Managed listener ports:** `src/lib/managed-ingress-ports.ts` mirrors the control-plane contract (`turbopanel/src/lib/managed/ingress-ports.ts`) — `postgres` / `mysqlFamily` (MariaDB rides the MySQL listener), platform defaults `15432` / `16306`, and the same rejections (`out_of_range` outside `1024`–`65535`, `reserved_admin` `6032` / `6132`, `reserved_private_range` `45000`–`45999`, `collision` when both families match), pinned by `managed-ingress-ports.test.ts`. `managed-services.ts` re-exports `managedIngressPortForEngine` — there must be exactly one implementation. Ports are **org-wide**, edited on `/<orgId>/managed/settings` as its own panel (blank field = inherit, via `parseManagedIngressPortInput`); there is no per-service port. Client-side validation is a courtesy — a **host** listener conflict is only detectable on the server, so a save can still fail from the daemon preflight. Never render a port from the platform constant when the API supplied one: the Connect panel prefers `connection.port` / `managed.port` and falls back to the default only before provisioning, since the effective port comes from the **server-owner** org.
- **Managed projects:** tabbed shell (`/overview`, `/connect`, `/data`, `/backups`, `/environments`) via `ManagedEnvironmentBody` focus panels — never Compose UI. **Overview** = cluster topology (replicas, promote); **Connect** = shared listener endpoints + CA download + service bindings; **Data** = credentials / users & databases. Create via empty project → setup → managed catalog; provisioning uses `createEnvironmentManaged` with show-once root password. **Members** ride `useEnvironmentManaged` + `useManagedStatus` (status polls only while `provisioning`/`applying`) — never a members-only timer; commands share one `COMMAND_POLL_MS` batch. **Backups** (`managed/managed-backups-panel.tsx`): **Back up now**; **Restore** behind typed confirmation (managed/project display name); **Delete** two-press. Metadata-only — no download endpoint. Project Settings tab removed; delete uses the shell trash control (compose delete lives in scope-chip settings → Danger instead).

### Workspaces

- Workspaces are a **project-organization filter**, not a primary sidebar area. The Projects page **workspace filter** defaults to **All workspaces** and always offers that option (last choice may be restored from localStorage / `?workspaceId=`). Choosing a workspace opens `/projects?workspaceId=…`; choosing All opens `/projects`. The TurboPanel Platform workspace (`kind=turbopanel`) appears as a same-height row with a Platform badge.
- Management CRUD lives at `/workspaces` (list/create/edit/detail) and is reached from the switcher (**Manage workspaces** / **Create workspace**), not from `ORG_AREAS`.
- List: `workspaces-overview-section.tsx` (`GET /api/client/v1/workspaces`). Edit forms: `workspace-form-section.tsx`. Name validation is shared via `src/lib/workspace-validation.ts`.
- **Create workspace wizard:** when the user can `organization:own`, `WorkspacesOverviewSection` renders the reusable `first-run-wizard.tsx` **above** the list `SectionPanel` as a friendly inline create form (title “Create a workspace”). Creates via `createWorkspace`, then refreshes the list + shared switcher query. New orgs already have a **Default Workspace** from install / Workers sign-up — this wizard is for adding more. Non-owners see the list only (empty copy when none exist).
- `FirstRunWizard` is presentational only (title, description, optional notes, optional name field, primary action) and is intended for reuse on other guided create screens.
- Projects overview copy and create links follow the active scope; the all-workspaces view labels each project with its workspace name.

### Instance API

Types and helpers: `src/lib/instance-api.ts` (auth, install, org servers, health). Update when `/api/client/v1` or `/api/install/v1` endpoints change.

Authorization helpers:

- `GET /api/client/v1/permissions` → `fetchPermissions()`
- `GET /api/client/v1/access?resourceId=<uuid>` → `fetchAccessGrants(resourceId)` — returns `{ access: AccessGrantRecord[] }`; each row carries `subjectKind`, `subjectId`, `resourceId`, `effect`, and `permissionKey`
- `GET /api/client/v1/access/resource-id?kind=<organization|team>&itemId=<uuid>` → `resolveResourceId(kind, itemId)`
- `POST /api/client/v1/access` → `createAccessGrant(body: CreateAccessBody)` — body: `{ resourceId, subjectKind, subjectId, effect, permissionKey }`; grant targets are organization or team entities only
- `DELETE /api/client/v1/access/:id` → `revokeAccessGrant(id)`
- `POST /api/client/v1/invitations/:id/accept` → `acceptInvitation(id)`
- `fetchVisibleWorkspaces()` → `GET /api/client/v1/workspaces` — each row includes `kind` (`'user' | 'system'`); never infer platform from `displayName`
- `restartSystemComponent(serverId, component)` → `POST /api/client/v1/servers/:id/system/:component/restart` — `CommandEnqueueResponse` + `serverId`; errors `unknown_system_component` / `system_component_not_provisioned` / `system_reconcile_unavailable`; descendant mutations may return **403** `system_resource_immutable`
- `ProjectRecord.metadata.component` — optional internal system-component idempotency key (e.g. `hosting-ingress`); never an authorization source
- `fetchVisibleProjects(workspaceId?)` → `GET /api/client/v1/projects` (optional `?workspaceId=` filter)
- `createProject({ type: 'empty' | 'docker-compose' | 'template' | 'managed', serverId?, … })` — `type` is **required**. UI create uses `type: 'empty'` then configure on setup. Project/workspace names are unique per org (trim + case-insensitive; **409** `project_name_in_use` / `workspace_name_in_use`). Managed create may pass `serverId` to pin the scaffolded Production environment
- `updateProject` / `updateEnvironment` accept `options.compose` as a ComposeDocument (`src/lib/compose/`); `updateProject` also accepts `options.containerNaming` (`uuid` \| `custom`)
- `deployEnvironment(environmentId, body?)` → `POST /api/client/v1/environments/:id/deploy`; body may include `acknowledgeHealthCheckWarnings` and/or `noCache` (cacheless redeploy → daemon `docker compose build --no-cache --pull` before `up`); the UI always requires placement (`environment.serverId` or project default) first; poll with `fetchCommand(serverId, commandId)` (Postgres only). **`422 fabric_reconcile_failed`** / **`409 fabric_reconcile_pending`** surface as TurboFabric copy in `deployErrorMessage` (never “WireGuard” / `tp0`)
- `fetchDeployPreview(environmentId)` → `GET /api/client/v1/environments/:id/deploy-preview` — `DeployPreviewResponse` (compiled `compose.yaml` snapshot with `role: 'runtime'`, optional `servers[]` per-host compile, deprecated merged `composeYaml` fallback, `envFile`, `secretPlan[]`, `projectName`, `containers[]`, `volumes[]`, `warnings[]`); secret values redacted; same prepare path as deploy. Preview fetch does not require an environment pin; **409** `server_placement_required` is the “select a server” gate.
- `stopEnvironment(environmentId)` → `POST /api/client/v1/environments/:id/stop` — compose down (with volumes) on `environment.server_id`; returns `{ commandId, serverId }` for polling; used by the project-delete wizard before cascade delete
- `runEnvironmentLifecycle(environmentId, action)` → `POST /api/client/v1/environments/:id/lifecycle` (`start` / `stop` / `restart`); non-destructive `environment.lifecycle` command; returns `CommandEnqueueResponse`
- Compose UI: Overview edits **base or this environment's settings** depending on the path (`/overview` → `project.options.compose` via `persistProjectCompose`; `/environments/:id` → `environment.options.compose` via `persistEnvironmentCompose`), both through the shared `compose-persistence.ts` helpers, and the environment editor still collapses to service status dots once containers exist. `ComposeEditorSection` accepts optional `onDraftChange` (debounced, `null` while YAML is unparseable). **Preview Deployment** (`PreviewDeploymentModal`) shows Merged / Prepared compose via lifecycle **Preview ▾** (inspect; Merged keeps service `x-turbopanel`) or deploy confirm — see **Overview Compose panel** above. Docker Compose project name is the TurboPanel project UUID; container names are service UUIDs (`containerNaming: uuid`). Deploy enqueues compiled runtime **`compose.yaml`** (`role: 'runtime'`; older `composeFiles[]` layer chains may still appear in responses). `deploy-prepare.ts` still emits deprecated **`composeYaml`** as a fallback. Preview **Prepared** shows compiled `compose.yaml` and per-server blocks when scheduled. `compose-editor-section.tsx` (Compose | Services) on project and environment detail. Placement is **not** stored in compose (instance validation rejects `x-turbopanel.placement`; UI strips it before save). The active tab is persisted in `presentation.editorView` (`editor` \| `visual`) on that compose document when saved — project base and each environment overlay keep their own preference (`readComposeEditorView` / `setComposeEditorView`); the YAML textarea and every read-only compose view show **native Docker Compose only** — all `x-turbopanel` metadata (top-level and per-service) is hidden via `hideComposeTurbopanelExtensions` / `stripComposeManagedExtension`, preserved through a name-keyed shadow, and re-attached on parse/save; edit those fields on the **Services** tab. **Services** form tab (`compose-visual-service.tsx`, view id `visual`) shows labeled **Name** (service key rename), optional **Description** (`x-turbopanel.description` — TurboPanel-only metadata), a **Service kind** picker (`container` vs `traditional-web` via per-service `x-turbopanel`), and for containers **Image** + **Tag** when there is no Dockerfile/`build` (joined into Compose `image:` via `parseComposeImageRef` / `formatComposeImageRef` in `src/lib/compose/image-ref.ts`); when a Dockerfile is present, Image/Tag/Registry are hidden (image is built on deploy — adding Dockerfile clears `image`; removing Dockerfile restores `nginx:alpine` if none remains); traditional-web shows **engine** (`nginx` / Apache / OpenLiteSpeed — all deployable; OpenLiteSpeed is static-only, no PHP/env hints) + relative **document root** instead of an image. Hosting PHP settings (`version` / memory / max execution time) apply on Apache traditional-web deploys via mod_php. **Registry** is an Add chip for alternate registries (`ghcr.io`, `quay.io`, `localhost:5000`, … — Docker Hub when omitted; only offered when Image/Tag are shown); digests round-trip when already present. Optional **Dockerfile** section (Add chip `Dockerfile` → Compose `build.context: .` + `build.dockerfile_inline` via `build-ref.ts`; platform-split `dockerfile-editor.*` — CodeMirror on web, monospace `TextInput` on native) is removable; external path-based builds render read-only with convert-to-inline. Inline edits are picked up on **Cacheless redeploy** or when `service.options.build.disableCache` is set. Optional Compose fields come from `VISUAL_SERVICE_FIELDS` in `src/lib/compose/visual-fields.ts` — flip `offerAdd` to expose an "Add …" button (currently **Restart** + **Dockerfile**; Compose Spec restart policies `no` / `always` / `on-failure[:max-retries]` / `unless-stopped`, default `always`). Ports stay editable when already present in YAML but are not offered as an Add button yet. **Compose** edits YAML with managed fields hidden and preserves `#` comments on save; a **Compose linter** (`lintComposeYaml` in `src/lib/compose/lint.ts`) runs live on both tabs (`ComposeLintPanel`) and flags invalid YAML, unknown top-level/service keys (with edit-distance "did you mean" hints — e.g. `imaage` → `image`), services missing `image`/`build` (traditional-web via hidden extension list), and author-typed `x-turbopanel` when managed extension is hidden, with 1-based line numbers sorted ascending (errors before warnings on the same line); badges/messages are red for errors and yellow for warnings. It gates save — client disables save when blocking issues exist, and the instance rejects `options.compose` with **400** `compose_invalid` + `issues` (same linter; empty-draft “no services” warnings are allowed). **Enter** auto-indents (2 spaces, deeper after `key:`), right-trims trailing spaces/tabs on every line, and re-indents a just-finished service-only key (`restart`, `image`, …) when it was left too shallow under `services:` (e.g. `restart: always` at column 0 → nested under the current service); top-level keys that are also service keys (`networks`, `volumes`, …) are left alone. **Tab** / **Shift+Tab** indent/outdent by two spaces via `src/lib/compose/yaml-indent.ts` (client-side; save still re-stringifies with the `yaml` package). The field itself is platform-split behind `compose-yaml-editor.tsx` (shared `ComposeYamlEditorProps`/`ComposeYamlEditorHandle` types in `compose-yaml-editor-types.ts`): **web** (`compose-yaml-editor.web.tsx`) is a real **CodeMirror 6** editor (`@uiw/react-codemirror`) with line numbers, indentation-guide lines (`@replit/codemirror-indentation-markers`), YAML syntax highlighting, and lint diagnostics in the gutter (`src/lib/compose/lint-diagnostics.ts` adapts `ComposeLintIssue[]` to CM `Diagnostic[]`; the `ComposeLintPanel` list stays below as the detailed view) — CM owns Tab/selection/smart-indent on web, with a custom Enter keymap reusing `indentAfterNewline` for parity; **native** (`compose-yaml-editor.native.tsx`) keeps the original transparent-`TextInput`-over-highlight-overlay approach (`src/lib/compose/yaml-highlight.ts` for muted comments + red/yellow lint-line tinting and the fixed-width `●`/`▲` gutter marker).
- `EnvironmentRecord.serverId` / `updateEnvironment(id, { serverId })` — placement pin SoT; compose never carries placement. `stripComposePlacement` is an input-sanitization path only (strips any `x-turbopanel.placement` a client might still submit); there are no read/write placement helpers — UI placement UX uses `serverId` only
- `fetchVisibleProjects(workspaceId?)` → `GET /api/client/v1/projects` (optional `?workspaceId=` filter)
- `fetchProjectCatalog()` → `GET /api/client/v1/project-catalog` — returns `{ catalog: CatalogSummary[] }`
- `fetchProject(id)` → `GET /api/client/v1/projects/:id`
- `createProject(body: CreateProjectBody)` → `POST /api/client/v1/projects`
- `updateProject(id, body)` → `PATCH /api/client/v1/projects/:id` — body accepts optional `workspaceId` (moves the project to another same-org workspace)
- `deleteProject(id)` → `DELETE /api/client/v1/projects/:id` — cascade-deletes environments/services/hostings/containers (variables/`managed` cascade via FK); returns **409** `project_has_running_services` (`PROJECT_HAS_RUNNING_SERVICES_ERROR`) when any non-stopped containers remain. Projects overview uses a two-step wizard (`project-delete-panel.tsx`): stop each environment with active containers, then type the project display name to confirm irreversible delete.
- `fetchVisibleEnvironments(projectId?)` → `GET /api/client/v1/environments`
- `fetchEnvironment(id)` → `GET /api/client/v1/environments/:id`
- `createEnvironment(body)` → `POST /api/client/v1/environments`
- `updateEnvironment(id, body)` → `PATCH /api/client/v1/environments/:id`
- `deleteEnvironment(id)` → `DELETE /api/client/v1/environments/:id`
- `fetchEnvironmentManaged(environmentId)` → `GET /api/client/v1/environments/:id/managed` — `{ managed, connection, settings, ssl, release, server, rootUsername, members, recovery }` (`managed` may be `null` before create; `members[]` is cluster topology; `recovery` is the latest HA journal row or `null`; `release` is the catalog identity of the running image — `series` / `variantId` / `lifecycle` / `image`, `null` when unprovisioned or uncatalogued). `ssl` is `{ configured, effective, organizationDefault }` and is **present even before create** so the setup surface can show the policy a new cluster inherits — resolve display from `effective`, never from `settings.ssl.mode` alone.
- `createEnvironmentManaged(environmentId, body?)` → `POST …/managed` — `{ ok, managed, commandId?, serverId?, rootPassword?, alreadyProvisioned? }`; plaintext `rootPassword` is **show-once**. Body may carry `engineSeries` + `imageVariant` from the release catalog (**422** `managed_version_unsupported` when unknown); omit both for the engine default
- `updateEnvironmentManaged(environmentId, { settings })` → `PATCH …/managed`
- `applyEnvironmentManaged(environmentId)` → `POST …/managed/apply` — `{ ok, commandId, status: 'queued', serverId }`
- `runManagedLifecycle(environmentId, action)` → `POST …/managed/lifecycle` (`start` / `stop` / `restart`)
- `deleteEnvironmentManaged(environmentId)` → `DELETE …/managed` — `{ ok, deleted, commandId?, serverId? }`
- `rotateManagedRootPassword(environmentId)` → `POST …/managed/root-password` — show-once `rootPassword` + optional `redeployRequired`
- `rotateManagedUserPassword(environmentId, principalId)` → `POST …/managed/users/:principalId/password` — show-once `password` + optional `redeployRequired`
- `fetchManagedUsers` / `createManagedUser` / `deleteManagedUser` → `…/managed/users` (create returns show-once `password`). Each login carries `connectionRole` (`read-write` default \| `read-only`) — the ProxySQL hostgroup that login reaches. Create sends it from the **Connection role** picker; **422** `managed_no_read_targets` when `read-only` is requested with no read-eligible replica. `readEligible` on a member never rewrites an existing login's queries, so the Connect tab's read-only block names the credential instead of implying automatic read splitting (`readOnlyLoginNames` / `hasReadEligibleReplica` in `src/lib/managed-read-endpoint.ts`).
- `fetchManagedDatabases` / `createManagedDatabase` / `deleteManagedDatabase` → `…/managed/databases` (name URL-encoded on delete)
- `fetchManagedMembers` / `addManagedReplica` (`replicaClass` default `failover`) / `updateManagedMember` (`readEligible` / `replicaClass`) / `removeManagedMember` / `promoteManagedMember` (`{ force }` bypasses lag/health on **failover** only; read class is 422 `managed_replica_not_promotable` with no class bypass) → `…/managed/members`. Read replicas use `promoteManagedDisasterRecovery` → `POST …/managed/disaster-recovery/promote` (`{ memberId, confirm: true }`). Cluster UI: `managedReplicaPromoteAction` → **Promote** vs **Promote for disaster recovery**; replica class **Failover** / **Remote read replica**; traffic **Serves reads** / **Standby only**; read-class rows **Manual DR candidate**; add-replica picker **Failover replica** / **Remote/read replica** plus **Serve read traffic**. Recovery chip from detail `recovery` (`AUTOMATIC_FAILOVER_BLOCKED_MESSAGE` when blocked). Poll via `useCommandsBatch` + Postgres managed detail — never `fetchServerCell`.
- `fetchManagedStatus(environmentId)` → `{ status, host, port, containers, members }` (Postgres-backed)
- `fetchManagedLogs(environmentId, tail?)` → `{ logs }` (on-demand daemon round-trip; never timer-polled)
- `fetchOrganizationManaged(orgId)` → `GET /organizations/:id/managed` — `{ managed: ManagedListRecord[] }` (includes `members[]`)
- `fetchBindings({ serviceId } | { environmentId } | { managedEnvironmentId })` / `createBinding` / `updateBinding` / `deleteBinding` → `/api/client/v1/bindings` — create returns `{ ok, id }`; update returns `{ ok }`. `managedEnvironmentId` lists bindings for a managed cluster (Connect/Users); `environmentId` lists consumer-service bindings in that environment; `serviceId` is the service panel filter.
- `fetchOrganizationCa()` → `GET /tls/ca` (ensure-or-create, public PEM only); `downloadOrganizationCaPem()` → `GET /tls/ca/download` (`application/x-pem-file` text)
- `fetchManagedBackups(environmentId)` → `GET …/managed/backups` — `{ backups: ManagedBackupRecord[] }`, metadata only (no download endpoint, no dump bytes ever cross this API)
- `createManagedBackup(environmentId, body?)` → `POST …/managed/backups` — `{ ok, backupId, commandId, serverId }`
- `deleteManagedBackup(environmentId, backupId)` → `DELETE …/managed/backups/:backupId` — `ManagedCommandResponse`; the consumer removes the metadata row on success
- `restoreManagedBackup(environmentId, backupId)` → `POST …/managed/backups/:backupId/restore` — `ManagedCommandResponse`; mutates the running engine, so it flips `managed.status` to `applying` like `apply`/`lifecycle`
- Types/helpers in `src/lib/managed-services.ts` (`ManagedStatus`, `ManagedSettings`, `ManagedBackupRecord`, `managedErrorMessage`, `shortBackupChecksum`, …)
- `fetchVariables(parentFilter)` → `GET /api/client/v1/variables?...` — `VariableParentFilter` includes `organizationId` / `workspaceId` / `projectId` / `environmentId` / `serviceId` / `hostingId` / `serverId`
- `fetchVariable(id)` → `GET /api/client/v1/variables/:id`
- `createVariable(body)` → `POST /api/client/v1/variables` (exactly one parent scope key)
- `updateVariable(id, body)` → `PATCH /api/client/v1/variables/:id`
- `deleteVariable(id)` → `DELETE /api/client/v1/variables/:id`
- Hosting-scoped vars: UI on each Hostnames card (`parentField: { hostingId }`); instance deploy merges them over service scope into compose injection (`mergeHostingVariablesForService`)
- `fetchContainers({ serviceId?, environmentId? })` → `GET /api/client/v1/containers` (optional `?serviceId=` / `?environmentId=` filters; AND when both set) — Postgres-backed rows; never DO reads
- `fetchContainer(id)` → `GET /api/client/v1/containers/:id`
- `createContainer(body)` → `POST /api/client/v1/containers` (`serviceId`, `serverId`, optional `metadata`/`options`)
- `updateContainer(id, body)` → `PATCH /api/client/v1/containers/:id` (`metadata?`, `options?`)
- `deleteContainer(id)` → `DELETE /api/client/v1/containers/:id`
- `fetchTlsLibrary()` → `GET /api/client/v1/tls` — public cert metadata + `certificatePem`; **never** private keys
- `fetchLicenses()` → `GET /api/client/v1/licenses` — owner-only active registration keys (`LicenseRecord`: `displayName`, `boundServer.displayName`). UI **Pending keys** lists unbound rows only; never the one-shot token.
- `deleteLicense(id)` → `DELETE /api/client/v1/licenses/:id` — owner-only; UI two-press delete for unbound revocable keys. Co-located key is not revocable.
- `createTlsCertificate(body)` → `POST /api/client/v1/tls` (`upload` | `self_signed` | `lets_encrypt`); upload sends PEM once; server seals the key as `tpsecret`
- `deleteTlsCertificate(id)` → `DELETE /api/client/v1/tls/:id`
- Hosting PATCH accepts optional `tlsId` (`null` = basic self-signed via Caddy `tls internal`; pin a library cert explicitly — Let's Encrypt is never selected unless you pin an LE cert) and optional `ipId` (`null` = any interface) plus `options.bind` (`public` | `datacenter` | `local`). The Hostnames editor shows bind chips; the public-IP picker appears only when bind is `public`.
- `options.protocol` (`http` default/omitted, or `tcp` | `udp`) plus `options.ports` (`{ published, target }[]`) let a hosting publish raw ports through Traefik instead of routing hostnames — used for non-HTTP docker services (Postgres, game servers, UDP relays). The **Hosting** panel (`environment-detail-section.tsx`, `HostingPanelRow`) shows a Protocol chip row (Http/Tcp/Udp) above the rest of the form; picking Tcp/Udp swaps the Hostnames input for a single-line `Ports` text field (comma-separated `published[:target]`, e.g. `5432, 8443:8080` — target defaults to published when omitted, parsed client-side by `parsePortsList`) and hides the TLS-certificate and Proxy/strip-prefix/path-prefix/target-port sections (all HTTP-only). Bind + Public IP pickers apply to both protocols unchanged. Server-side validation (`deploy-validation.ts` in the instance repo) rejects an empty `ports[]` for `tcp`/`udp` at deploy time — see `../turbopanel/AGENTS.md` → Command Pipeline and `../turbopaneld/AGENTS.md` → Tenant deploy & hosting ingress for the full contract. For HTTP hostings, the panel is **engine-aware** via `resolveHostingServiceContext` (`src/lib/compose/hosting-service-context.ts`) on the merged compose service: badge shows Container vs Traditional web · engine; Apache shows PHP + web.env (SetEnv) fields; nginx/OLS hide PHP (OLS also hides web.env) unless stale values need clearing; containers prefer Hosting variables and surface `TURBOPANEL_TRADITIONAL_WEB_*` bridge-env hints when traditional-web siblings exist; path-prefix copy lists sibling traditional-web services for shared-hostname static+PHP setups.
- `fetchDatacenters()` / `fetchDatacenter(id)` / `createDatacenter` / `updateDatacenter` / `deleteDatacenter` / `addDatacenterMembers` / `removeDatacenterMember` / `createDatacenterSubnet` / `updateDatacenterSubnet` / `deleteDatacenterSubnet` → `/api/client/v1/datacenters`; create body is `{ displayName?, description?, members: [{ serverId, address }], sourceServerId? }` (first subnet is derived from the seed member’s reported private `ips[].cidr` when present, otherwise a typical LAN `/24` or `/64` — never typed); list includes `DatacenterRecord.privateCidrs: string[]` (one entry per subnet, default `[]`); detail is `{ datacenter: DatacenterDetailRecord; members: DatacenterMemberPin[] }` with `subnets[]` and per-pin `members[]` (default `[]` on older payloads). `removeDatacenterMember` removes every pin for that server in the datacenter. `PATCH /datacenters/:id` **replaces** `options` — UI merges via `mergeDatacenterOptions` so timezone and `addressPreference` cannot clobber each other. `fetchDatacenterNameSuggestions()` derives editable names from server geo/ASN metadata; delete returns **409** `datacenter_has_members` until every pin is gone (`DATACENTER_HAS_MEMBERS_ERROR`), then **409** `datacenter_has_networks` only if leftover non-site networks remain. Subnet create **409** `subnet_overlaps` / **400** `invalid_cidr`; subnet delete **409** `subnet_has_members`.
- `fetchIps(filters?)` / `fetchIp` / `createIp` (never send `version`) / `updateIp` / `deleteIp` → `/api/client/v1/ips`; `IpScope` is `'public' | 'datacenter'` (no `loopback`, no `vpn`); `version` is server-derived/read-only; optional `description` (`varchar(255)`, not a display name). Datacenter **free pool** is `datacenterId` only; a **membership pin** (`serverId`) requires `datacenterId` + `networkId` (site subnet of that datacenter). Delete surfaces **409** `ip_in_use` as "This address is pinned to a hosting — unassign it first."
- `fetchNetworks(filters?)` / `createNetwork` / `updateNetwork` / `deleteNetwork` → `/api/client/v1/networks` (org-scoped; `NetworkKind` is `'datacenter' | 'docker'` — no `server`; optional `organizationId` / `datacenterId` / `serverId` (host pin on docker only) / `kind`)
- Error constants: `IP_IN_USE_ERROR`, `GATEWAY_DATACENTER_REQUIRED_ERROR`, `GATEWAY_DATACENTER_CIDR_REQUIRED_ERROR` (relay PATCH), `FABRIC_RECONCILE_FAILED_ERROR` / `FABRIC_RECONCILE_PENDING_ERROR` (deploy), `DATACENTER_HAS_MEMBERS_ERROR` / `DATACENTER_HAS_NETWORKS_ERROR` (datacenter delete), `SUBNET_OVERLAPS_ERROR` / `SUBNET_HAS_MEMBERS_ERROR` / `INVALID_CIDR_ERROR` / `ADDRESS_NOT_IN_ANY_SUBNET_ERROR` / `ADDRESS_IN_USE_ERROR` (subnets / pins), `DATACENTER_IP_REQUIRED_ERROR` / `PRIVATE_PATH_UNAVAILABLE_ERROR` / `PRIVATE_FAMILY_MISMATCH_ERROR` (managed replica overlay — live instance codes from `private-endpoint.ts`; `PEER_TUNNEL_ADDRESS_REQUIRED_ERROR` in `instance-api.ts` / `managed-services.ts` is a dead constant, code follow-up), `MANAGED_REPLICA_NOT_PROMOTABLE_ERROR` / `FAILOVER_REPLICA_REQUIRES_DATACENTER_TRANSPORT_ERROR`
- `updateServer(id, { displayName? })` → `PATCH /api/client/v1/servers/:id` (membership uses `addDatacenterMembers` / `removeDatacenterMember`, not `datacenterId`)
- Types: `ProjectRecord` (`metadata.type`, `options.compose`), `EnvironmentRecord` (`metadata`, `options.compose`), `CatalogSummary`, `VariableRecord`, `CreateProjectBody`, `ServiceRecord` (`displayName`, `composeServiceName` — compose key is derived-only; never send on create/update), `ContainerRecord` (`serviceId`, `serverId`, top-level `containerId` / `containerName` / `status` / `composeServiceName` / `role` (`'service' | 'ingress' | 'turbopanel'`, allocator-owned — `service` is an ordinary workload container, `ingress` is the per-service Traefik at ordinal 1 named `<serviceId>-in`, `turbopanel` is a `turbopanel-system` platform component) — status/id from Postgres reconcile, never DO reads; residual `metadata` only), `DeployPreviewResponse.containers[]` also carries `role`, `TlsRecord` (`source`, `metadata`, `certificatePem` — no private key), `DatacenterRecord` (`privateCidrs: string[]` — one entry per subnet), `DatacenterDetailRecord` (`subnets[]`), `DatacenterMemberPin` (`serverId`, `address`, `ipId`, `networkId`), `DatacenterOptions.addressPreference` (`ipv6` default when absent), `IpRecord` (`scope` `'public' | 'datacenter'`, derived `version`, optional `description`), `NetworkRecord` (`kind` `'datacenter' | 'docker'`, `cidr`, …), `OrgFabricSettings` (`enabled`, `fabric?`, `relays[]`), `RelayRecord` (`serverId`, `address`, `role` `'gateway' | 'member'`, `advertisedCidrs` stored override, `resolvedAdvertisedCidrs` effective IPv4 list, `endpointAddress` pin, `resolvedEndpoint`, `hasPresharedKey`, `segments[]`, never `presharedKey`), `HostingRecord` (`tlsId?`, `ipId?`), `OrgServerRecord` / `ServerDetailRecord` (`datacenters: { id, displayName }[]` — multi-membership pins)
- **Secret write-only rule:** `VariableRecord.value` is always `null` when `isSecret` is true — the UI must never display or pre-fill secret values; use masked placeholders and write-only update forms. Generated secrets may be shown once at create time, then never again.
- **Binding secret rule:** `BindingRecord.keys[]` is metadata only (key names). Binding password / URL / CA values never cross the client API. UI shows locked key chips and never invents a reveal. Rows with `VariableRecord.bindingId != null` are locked (“From connected databases”) — no edit/delete/flag-toggle.
- **Principal password write-only rule:** principals are not a public org-console surface. Hosting/database-user flows create them behind the scenes; passwords are sealed as `tpsecret` at rest and must never be displayed or pre-filled after the optional show-once generate step.
- **Managed password show-once rule:** `createEnvironmentManaged`, `rotateManagedRootPassword`, and `createManagedUser` may return plaintext once. Render via `SecretReveal` only; clear from state when dismissed / on unmount — never persist or re-display.
- `fetchServerUpdate(serverId)` → `GET /api/client/v1/servers/:id/update` — returns `ServerUpdateStatus` with `current`/`target` commit identity and `updateAvailable`.
- `triggerServerUpdate(serverId)` → `POST /api/client/v1/servers/:id/update` — triggers a trunk update on the connected daemon; requires `organization:manage`.
- `fetchServer(serverId)` → `GET /api/client/v1/servers/:id` — unwraps `{ ok, server }` → `ServerDetailRecord` (Postgres-backed detail read; never `fetchServerCell`). Optional `labels[]` for Overview.
- `fetchServerLabels(serverId)` / `saveServerLabels(serverId, labels)` → `GET`/`PUT /api/client/v1/servers/:id/labels` — PUT is replace-all `{ labels: { key: value } }`.
- `fetchOrgFabric(orgId)` / `saveOrgFabric(orgId, enabled, extras?)` → `GET`/`PUT /api/client/v1/organizations/:id/fabric` — TurboFabric opt-in (`{ enabled, fabric?, relays[] }`). **GET is manage-gated**; datacenter/server Network views must pass `useOrgFabric(orgId, { enabled: canManage })` and show permission-aware copy instead of empty-relay messaging. Not required for standalone Docker; never auto-enable. UI copy uses `TURBOFABRIC_PRODUCT_NAME` (`TurboFabric`). Org PUT may include `allowRelay` (degraded opt-in; default off). `RelayRecord.paths[]` is diagnostics-only per-peer path state (`direct_lan` / `direct_public` / `direct_nat` / `gateway` / `relay` / `unreachable`). Relays also carry `allowRelay` / `effectiveAllowRelay` / `preferredGatewayIds` / `gatewayEligible`. `network-fabric-section.tsx` renders a peer-path matrix plus org/relay `allowRelay` controls (no Links route).
- `patchOrgFabricRelay(orgId, serverId, body)` → `PATCH /organizations/:id/fabric/relays/:serverId` (`role?`, `advertisedCidrs?`, `keepalive?`, `endpointAddress?`, write-only `presharedKey?`, `allowRelay?` (`null` inherits org), `preferredGatewayIds?`). **422** `gateway_datacenter_required` / `gateway_datacenter_cidr_required` on gateway promote; **422** `preferred_gateway_invalid` (`PREFERRED_GATEWAY_INVALID_ERROR`) when a preferred id is not a gateway-role relay.
- `applyOrgFabric(orgId)` → `POST /organizations/:id/fabric/apply` — `{ ok, fabricId, interfaceName: 'tp0', results[] }` (`queued` / `failed` / `skipped` / `converged` + `commandId?`). Feed queued `{serverId, commandId}` pairs into `useCommandsBatch`; **Apply stays disabled** while `hasPendingTrackedCommands` (tracked batch loading or any non-terminal). Merge later queued ids with `mergeTrackedCommandEntries` so an in-flight batch is not replaced. Hooks: `useOrgFabric` / `usePatchOrgFabricRelay` / `useApplyOrgFabric` in `src/lib/queries/fabric.ts`. There is no Links route — datacenter detail summarizes relays via `src/lib/fabric-mesh.ts`.
- `setServerTimezone(serverId, timezone)` → `POST /api/client/v1/servers/:id/timezone` — `CommandEnqueueResponse`.
- `setServerNtp(serverId, input)` → `POST /api/client/v1/servers/:id/ntp` — at least one of `enabled` / `servers` / `fallbackServers` required.
- `fetchTimezones()` → `GET /api/client/v1/timezones` — `{ timezones: string[] }`.
- `fetchOrgDefaultTimezone(orgId)` / `saveOrgDefaultTimezone(orgId, patch)` → `GET|PUT /api/client/v1/organizations/:orgId/default-timezone`.
- `fetchOrgHostDefaults(orgId)` / `saveOrgHostDefaults(orgId, patch)` → `GET|PUT /api/client/v1/organizations/:orgId/host-defaults` — manage-gated `{ sshPort, ntp, defaultFabricEnabled }`. SSH/NTP cascade org → datacenter → server (`src/lib/host-defaults.ts`); `defaultFabricEnabled` is org-only preference (does not call `PUT …/fabric`). `null` clears a layer. Server list/detail expose effective `sshPort` / `sshPortSource` / `ntpDefaults` / `ntpDefaultsSource`; detail also has `datacenterDefaultTimezone` / `datacenterEnforceServerTimezone`. `updateServer` accepts `options.sshPort` / `options.ntp`. Datacenter `PATCH options` must `mergeDatacenterOptions` (replace-all). Saving does not rewrite sshd or apply NTP.
- `fetchOrgDefaultEnvironment(orgId)` / `saveOrgDefaultEnvironment(orgId, defaultEnvironmentName)` → `GET|PUT /api/client/v1/organizations/:orgId/default-environment` — scaffold name (`null` = `Production`).
- `fetchOrganizations()` → `GET /api/client/v1/organizations` — `{ organizations: OrganizationRecord[] }` (id, displayName, createdAt).
- `fetchOrganization(id)` → `GET /api/client/v1/organizations/:id` — `{ organization }`; **404** if missing or inaccessible.
- `createOrganization({ displayName })` → `POST /api/client/v1/organizations` — `{ ok, id }`; caller becomes owner.
- `updateOrganization(id, { displayName })` → `PATCH /api/client/v1/organizations/:id` — manage-gated rename (length-only display-name contract: any characters except control characters, ≤255; cannot clear; names are not unique); `{ ok, organization }`. Overview form uses `useUpdateOrganization` and updates `queryKeys.auth.organizations`. Display-name validation in `src/lib/display-name.ts` mirrors the instance helper (`turbopanel/src/lib/display-name-format.ts`).
- `fetchOrgServerCapacity(orgId)` / `saveOrgServerCapacity(orgId, maxServers)` → `GET|PUT /api/client/v1/organizations/:orgId/server-capacity` — seat cap (`null` = unlimited); enrolled servers + unconsumed registration keys count.
- `fetchOrgManagedDefaults(orgId)` / `saveOrgManagedDefaults(orgId, patch)` → `GET|PUT /api/client/v1/organizations/:orgId/managed-defaults` — manage-gated managed-database defaults; `{ sslMode, effectiveSslMode, ports, effectivePorts }` (a `null` field = no org default, so it resolves to the platform value: `require`, `15432`, `16306`). The PUT body is a **patch**: an omitted key is left unchanged and `null` clears it, so the TLS and listener-port panels save independently instead of one overwriting the other. Saving a mode only moves services that never set their own.
- The Update button is gated by `useCan('organization', orgId, 'organization:manage')` as a display hint; the server enforces the real 403. Non-managers see commit rows read-only with no button.

#### Servers overview table

- `servers-overview-section.tsx` can show a lean selectable **Detail** list (full-width rows) or compact **Summary** tiles. Icon-only view toggle (accessible names **Detail view** / **Summary view**) persists in `localStorage` (`turbopanel.serversLayout`, default Detail). All actions sit on the **right** of the **Servers** title; native puts that toolbar on the same row. No “select hosts…” blurb. Web Detail columns: Host (display name / hostname; OS logo — no UUID), Status (Online / Initializing / Offline — `resolveServerConnectionStatus` treats never-connected `statusChangedAt: null` as Initializing so post-install colocated hosts are not shown Offline while the daemon connects), **Country** (flag + English name from geo), **Usage** (vertical CPU / Load / Mem / Swap columns from one `GET /servers/metrics/latest` fleet snapshot; list density is short, tile density is taller; hosts with no sample yet keep the same four tracks as ghost columns with ellipsis values), Mesh, checkbox column (header = select all). Native Detail **stacks** those fields in a full-width row (no horizontal scroll) and sits outside glass; Summary tiles are hairline cards on the page (not inside the fleet glass) with select-all in the title row. Empty org: **Add your first server** (never “Waiting for this server” / colocated-registering copy — a new org on a self-hosted instance has no hosts). Row / tile press navigates to `/<orgId>/servers/[serverId]`; checkbox uses `stopPropagation` so selection does not navigate.
- Fleet capacity tiles (Servers · Cores · RAM) live on **Overview**, not this page. Load bars still use the sum of `resources.cpus[].threads.total` (leftover `resources.cpu.threadCount` is accepted).
- OS logos: Debian / Raspberry Pi OS via `osLogo` (`debian` | `raspberry-pi-os`) from density-aware PNGs (`assets/os/<slug>.png` + `@2x` / `@3x`) in `src/lib/os-logos.ts`.
- Batch **Update** targets **selected** updatable hosts only; per-host commands, delete, time/network, and metrics live on the server detail page.
- `OrgServerRecord` from `GET /api/client/v1/servers` includes `os` / `osDisplay` / `osLogo`, plus `resources` (`cpus[]` / `gpus[]` / RAM / swap **and** `ips`), top-level `ips` (same list), `timeSync`, `docker` (null when Docker is not installed), `timezone`, `timezoneSource` (`server` / `organization` / `datacenter` / null), effective `sshPort` / `sshPortSource`, `ntpDefaults` / `ntpDefaultsSource`, and `datacenters: { id, displayName }[]` (multi-membership pins). Each reported IP may include `interface`. CPU sockets are `resources.cpus[0]`, `cpus[1]`, … (`vendorId` like `GenuineIntel`, `cores` / `threads` with optional `p`/`e`, `cache`, `speedMhz` / `turboMhz`). GPUs are `resources.gpus[0]`, `gpus[1]`, … (name, PCI vendor id, memory, driver). Leftover `resources.cpu` (`coreCount` / `threadCount`) is still accepted for fleet totals.
- Fleet usage: `useFleetServerUsage` → `fetchFleetMetricsLatest` — **one** O(1) call, never per-server metrics series on this page. Vertical columns show stacked CPU (user/system/other/iowait, fill grows up), load (fill = load1/cores; visible value is load1), memory and swap. Overview status tiles sum cores/RAM from `server.resources` (+ metrics-derived RAM fallback) via `src/lib/fleet-capacity.ts`.

#### Server control panel (`/<orgId>/servers/[serverId]`)

- `server-detail-section.tsx` — one `fetchServer` query (`refetchInterval` 30 s, **2 s while Initializing**); never `fetchServerCell`. Tabs: Overview, Control, Time, Network, Metrics — active tab in `?tab=` (`SERVER_DETAIL_TAB_IDS` in `org-navigation.ts`). Overview includes a replace-all **labels editor** (`GET`/`PUT /servers/:id/labels`; Docker engine-label charset; value cap is `DESCRIPTION_MAX_LENGTH` by Unicode code point; `organization:manage` display hint) plus **SSH port** (`ServerSshPortPanel` — effective port + source; managers `PATCH options.sshPort`, empty/`null` inherits). Time tab treats datacenter timezone enforce like org enforce, prefills NTP from `ntpDefaults` when `timeSync` is empty, and still applies via `POST /ntp`.
- Overview header shows how the daemon reaches the control plane under Online/Offline: `via Local Unix Socket` when colocated / `__direct__`, otherwise `via <IP>` from observed `remoteAddress`. No Connection panel, Online/Offline since, last sample, or 24h reporting on Overview (metrics live on the Metrics tab).
- Single command poll timer (`COMMAND_POLL_MS`) for ping, hostname, reboot, timezone, and NTP on this page; terminal hostname/reboot/timezone/NTP success invalidates `['server', serverId]`.
- Legacy deep link `/<orgId>/servers/[serverId]/metrics` unchanged; Metrics tab embeds `ServerMetricsSection` with `embedded`.

#### Servers overview — add server

- **+ Server** on `servers-overview-section.tsx` (gated by `organization:own`) sits with batch **Update** on the title row (right); toggles `AddServerWizard` as its own glass panel between the title row and the fleet. Title is **Add server** (no subtitle). Connect step offers wait, **Add another server**, or **Close**. Native hides **Update** until hosts are selected.
- `resolveServerAddEligibility(capacity?)` in `src/lib/server-add-eligibility.ts` gates **+ Server** from org seat capacity (`maxServers`); unlimited when omitted/null. `POST /licenses` still enforces **409** `server_capacity_exceeded` server-side.
- Wizard shows the install command only (key embedded, one-shot); avoid "create license" / license-management copy. Production shape: `curl -fsSL turbopanel.sh | TURBOPANEL_LICENSE=… sh`. Dev rebuild via `resolveDisplayedInstallCommand` / `buildInstallCommandWithBaseUrl` validates the edited origin, emits values unquoted, adds `TURBOPANEL_HOST`, `TURBOPANEL_DL_BASE=<origin>/downloads/daemon`, and `TURBOPANEL_INSECURE_TLS=1` **only** when `installOriginNeedsInsecureTls` is true (LAN / `:8443` platform CA). Public HTTPS on 443 (Cloudflare tunnel) must not set insecure TLS. Quick-pick chips list each managed public URL plus Use HTTPS (`:8443`) / Use HTTP (`:8880`).
- Unused keys (minted, not bound): sidebar **Pending keys** (`/<orgId>/servers/keys`) plus a quiet count link on the servers overview. `GET`/`DELETE /api/client/v1/licenses` (`fetchLicenses` / `deleteLicense`); list JSON is `displayName` / `boundServer.displayName`. Two-press delete for unbound revocable keys only. Create body sends `displayName`. The Add Server wizard validates a non-empty optional name with `validateDisplayName` before `useCreateLicense`.

#### Server metrics (`/<orgId>/servers/[serverId]/metrics`)

- **Route/nav** — `src/app/[orgId]/servers/[serverId]/metrics.tsx` → `ServerMetricsSection` (`src/components/org/server-metrics-section.tsx`); registered in `src/lib/org-navigation.ts` (`serverMetricsHref`).
- **Charts** — `react-native-gifted-charts` (`LineChart`) with `expo-linear-gradient` for area fills, over `react-native-svg` as the renderer (pinned `15.15.4`). Web support: `metro.config.js` aliases `react-native-linear-gradient` → `expo-linear-gradient` because gifted-charts' gradient helper statically `require`s the RN linear-gradient peer; Metro resolves it at bundle time, so the alias keeps `pnpm web` / `pnpm export` from failing. `MetricLineChart` self-measures width (`onLayout`) and uses `disableScroll` / `adjustToWidth` so it fills `ChartCard` responsively (single/two-column) with no horizontal scroll; missing samples render as line breaks (`interpolateMissingValues={false}`), and the coverage strip conveys gaps. Components: `src/components/org/charts/chart-card.tsx`, `chart-legend.tsx`, `metric-line-chart.tsx`.
- **API** — `fetchServerMetricsSeries` / `fetchServerMetricsSummary` in `src/lib/instance-api.ts`; types `MetricsSeriesResponse`, `MetricsSeriesPoint` (`values`, `sampleCount`, `expectedSampleCount`), `HostMetricKey`, `MetricsBackendKind`, `MetricsBackendUnavailableError`.
- **O(1) fetch rule** — one combined series call per visible dashboard; refresh restrained (1 h/6 h → 60 s, 24 h → 300 s, longer ranges → no auto-refresh). Use backend `resolutionSeconds` — never fetch thousands of points to discard client-side. Ranges 1 h / 6 h / 24 h / 7 d / 30 d / 90 d, bounded by backend retention. Paired charts only — never all 20 metrics in one view.
- **Rendered states** — no metrics yet; storage still starting; unsupported OS; backend unavailable (ClickHouse `503`); sample gaps (distinct from zero values); stale/offline server; partial metric availability. Charts are not real-time below the ~60 s collection interval. Coverage uses a half-open `[from, to)` bucket grid (mirrors instance `computeSeriesGapCount`) so a live 1 h @ 60 s range expects 60 slots, not 61.

#### Server status reads — Postgres only

- Server online/offline status, `connectedAt`, `statusChangedAt`, `hostname`, `remoteAddress`, `geo`, and `os` / `osDisplay` / `osLogo` all come from `GET /api/client/v1/servers` (Postgres-backed, no Durable Object reads).
- `lastInboundAt` is a diagnostics **cell snapshot** field, not part of the Postgres read model — `resolveFleetPresence()` (`src/daemon/cell/server-status.ts`) only fills it when called with `{ withSnapshots: true }`, which the normal `/servers` route never sets. It is `null` on every default status read; it only has a value on an explicit admin/debug cell snapshot (`GET /api/client/v1/servers/:id/cell` / `fetchServerCell()`).
- Batch update status comes from `GET /api/client/v1/servers/updates` (single call for all servers).
- Per-server status is available via `fetchServerStatus(id)` → `GET /api/client/v1/servers/:id/status` (Postgres-backed). `ServerStatusRecord` (`instance-api.ts`): `serverId`, `connected` (boolean API field; backing column is `is_connected`), `daemonStatus` (`'online' | 'offline' | 'unknown' | null` — **derived at the API layer** from `connected` + `statusChangedAt`, not a stored `server` column; `unknown` only when `statusChangedAt` is null, i.e. the server has never transitioned), `connectedAt` (derived — set only while `connected`), `statusChangedAt` (last online/offline transition), `hostname`, `remoteAddress`, `geo`, `colocatedWithInstance`. There is no `lastSeenAt` / `disconnectedAt` field on this type — the instance dropped those columns; do not reintroduce them here.
- **Never call `fetchServerCell()` from a timer or from any normal status view.** It hits the Durable Object directly and is admin/debug-only. It is annotated as such in `instance-api.ts`.
- Do not add per-server polling loops. N servers must not produce N repeated DO or Redis calls. The servers page must issue O(1) status calls regardless of fleet size.
- The same Postgres-only status semantics hold identically on Workers (Cloudflare) and self-hosted (Deno/Redis) modes.
- `DaemonCellSnapshot` / `FetchServerCellResponse` types remain in `instance-api.ts` for admin surfaces only; do not import them in normal org views.
- Durable Object billing, cell storage schema, and the "no DO polling / O(1) status reads" rationale are canonical in `../turbopanel/AGENTS.md` (Daemon Cell); UI must never introduce per-server DO/Redis reads.

`useCan(scopeKind, itemId, permissionKey)` in `src/lib/query-client.ts` is a **display hint only** — never a security boundary. On `403`, call `handleUnauthorized()` from `useAuth()` to clear the session and redirect.

## Admin area (`/admin/*`)

Instance-wide administration for users with the `admin` or `superadmin` role.

### Layout

- `src/app/admin/_layout.tsx` — role guard (`superadmin` or `admin` via `isAdminSession`); non-admins redirect to their dashboard
- `src/lib/admin-navigation.ts` — area registry (`ADMIN_AREAS`); add entries + routes together
- `src/components/admin/admin-shell.tsx`, `admin-sidebar.tsx`, `admin-header.tsx` — responsive shell (mirrors org console); header has **Return to instance** (org-switcher slot) via `ReturnToInstanceSegment` → preferred org dashboard; sidebar nav uses `AdminAreaIcon` per area

### Areas (routes)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/admin/networking` | `control-plane-urls-section.tsx` | Control-plane public URLs and TLS cert SANs |
| `/admin/email` | `email-settings-section.tsx` | System email provider (SMTP / Mailgun) |
| `/admin/signup` | `signup-settings-section.tsx` | Public sign-up enable/disable (`IS_SIGNUP_ENABLED` DB setting) |
| `/admin/secrets` | `secrets-reencrypt-section.tsx` | Superadmin **Re-encrypt secrets** sweep — re-seals at-rest `tpsecret` blobs (variables, TLS keys, principal passwords) onto the current data-encryption key version |

### Instance API

Admin helpers in `src/lib/instance-api.ts` (`ADMIN_API = '/api/admin/v1'`):

- `fetchPublicUrls()` → `GET /api/admin/v1/instance/public-urls`
- `savePublicUrls(urls)` → `PUT /api/admin/v1/instance/public-urls`
- `applyPublicUrls(urls?)` → `POST /api/admin/v1/instance/public-urls/apply` (Deno self-hosted only)
- `fetchSignupSettings()` / `saveSignupSettings(enabled)` → `GET/PUT /api/admin/v1/settings/signup` — panel toggle for public sign-up (`IS_SIGNUP_ENABLED`); **409** when env force override is set
- `applyReencryptSecrets(body?)` → `POST /api/admin/v1/secrets/reencrypt` (superadmin only; bounded batches — pass prior `cursor` until `completed`; returns `{ ok, scanned, reencrypted, skipped, failed, completed, cursor }`; **409** `reencrypt_in_progress` when another sweep is running)

When apply returns 422 with `"cert apply is not applicable on this runtime"` (Workers), hide the Apply button and show an informational note instead.

`useCan` is display-only; rely on server 403s and `handleUnauthorized()`.

## Command Pipeline UI

Per-server command actions use `src/components/org/server-commands-panel.tsx` on the server detail **Control** tab. Commands follow a create-then-poll pattern: the UI enqueues via a mutation hook, receives a `commandId`, then polls with `useCommandsBatch` from `src/lib/queries/commands.ts` (`COMMAND_POLL_MS`, `isTerminalCommandStatus`) — a single React Query with `refetchInterval` while any tracked command is non-terminal. No hand-rolled `setInterval` per page or per server.

### API helpers — `src/lib/instance-api.ts`

- `pingDaemon(serverId)` → `POST /api/client/v1/servers/:id/commands/ping` — returns `CommandEnqueueResponse`: `{ ok: true, commandId, status }`.
- `setServerHostname(serverId, hostname)` → `POST /api/client/v1/servers/:id/hostname` — returns the same `CommandEnqueueResponse` shape: `{ ok: true, commandId, status }`.
- `rebootServer(serverId)` → `POST /api/client/v1/servers/:id/commands/reboot` — returns `CommandEnqueueResponse`.
- `fetchCommand(serverId, commandId)` → `GET /api/client/v1/servers/:id/commands/:commandId` — returns `CommandRecord`; for `daemon.ping` commands the response includes optional `latency` (`PingLatencyBreakdown`).
- Types: `CommandStatus` (string union of all statuses), `PingLatencyBreakdown`, `CommandRecord`, `CommandEnqueueResponse`.
- The `CommandRecord` shape is flat (all lifecycle timestamps are top-level fields); the instance serializes them from the `metadata` jsonb blob server-side — the UI type and fetch helpers are unchanged.

**Latency breakdown shape** (`CommandRecord.latency` for `daemon.ping`):

```
PingLatencyBreakdown {
  apiToConsumerMs: number | null       // queuedAt → dispatchStartedAt
  consumerToCellMs: number | null      // dispatchStartedAt → sentAt
  cellToDaemonMs: number | null        // sentAt → ackedAt
  daemonProcessingMs: number | null    // daemonReceivedAt → daemonRespondedAt (from result)
  daemonToRecordedMs: number | null    // daemonRespondedAt → finishedAt
  totalRoundTripMs: number | null      // queuedAt → finishedAt
}
```

Segment durations are computed server-side from the flat `CommandRecord` lifecycle fields (`queuedAt`, `dispatchStartedAt`, `sentAt`, `ackedAt`, `finishedAt`) before being exposed on `CommandRecord.latency`.

### Ping / hostname / reboot

- Surface on the server detail **Control** tab via `ServerCommandsPanel`.
- Mutations: `usePingDaemon` / `useSetServerHostname` / `useRebootServer` from `src/lib/queries/servers.ts`.
- In-flight command ids feed `useCommandsBatch`; terminal success invalidates the server detail key.
- Hostname/reboot gated by `useCan(…, 'organization:manage')` as a display hint; disabled when `!server.connected`.
- Reboot uses two-step confirm. Do not add per-server background polling loops — O(1) shared batch query only.
