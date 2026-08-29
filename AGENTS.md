# AGENTS.md

Expo web UI for TurboPanel. Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Project metadata / public naming

| Public name | GitHub | Internal term |
| --- | --- | --- |
| TurboPanel UI | [TurboPanel/ui](https://github.com/TurboPanel/ui) | `ui` |

Main product: [TurboPanel/turbopanel](https://github.com/TurboPanel/turbopanel) (TurboPanel Control Plane). **License:** AGPL-3.0-only with the [Apple App Store additional permission](./LICENSES/TurboPanel-Apple-App-Store-Additional-Permission.txt) (`LICENSE` stays unmodified AGPLv3; keep `package.json` `"license": "AGPL-3.0-only"` — do not invent an SPDX exception identifier). **Maturity:** **Private alpha**. README is product-facing; AGENTS.md is maintainer-facing. This repo is not deployed standalone — Caddy serves the control plane export.

**Licensing operations:** contributions require the [CLA](https://github.com/TurboPanel/.github/blob/trunk/CLA.md). Trademarks are not granted by the software license ([`TRADEMARKS.md`](./TRADEMARKS.md)). Third-party components keep their own licenses ([`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md); `pnpm notices:generate` / `notices:check`). Third-party OS artwork in [`assets/os/`](./assets/os/) is recorded in [`assets/os/NOTICE.md`](./assets/os/NOTICE.md) and is not licensed under this repo's AGPL or the Apple App Store additional permission — that permission covers only material TurboPanel has authority to license ([`LICENSES/README.md`](./LICENSES/README.md)). Publish Corresponding Source for the exact revision of every store binary and production EAS Update before that artifact ships (not `trunk`). App Store Connect custom EULA must identify the AGPL source and additional permission before the first iOS release. Native **Settings → About** (`/about`, also in the account menu) names the license, version/build, and Corresponding Source URL for the exact git revision baked by `app.config.ts` — never `trunk`. Unsigned users may open `/about`. Production EAS Build, store build, and EAS Update **fail fast** in `app.config.ts` when a full git commit cannot be resolved — the source URL must be `/tree/<full-sha>`, never the repository root. `app.config.ts` imports `src/lib/source-release-node.mjs` (Node ESM); Expo compiles the config to `app.config.js` and cannot resolve an extensionless `./src/lib/source-release` TypeScript import. `pnpm eas:update` sets `EXPO_PUBLIC_GIT_COMMIT` so EAS Update records that revision. Product-facing README and `../website` `/open-source` plus `docs/getting-started/licensing.mdx` are the published story — keep them aligned when notices or provenance files change.

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
  runs lint + `check:vocabulary` + typecheck + **`pnpm test:coverage`** (Vitest v8 LCOV at
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
| **Building / reusing a component** | [Component layer](#component-layer) — `src/components/ui` barrel; `ui/` never imports from `org/` |
| **Agent skills** | [Agent skills](#agent-skills) — canonical `.agents/skills/` footprint |
| Stack / fonts / Tamagui | [Stack](#stack) |
| Auth, install, sign-up | [End-user auth & first-run install](#end-user-auth--first-run-install-self-hosted) |
| Org routes & shell | [Organization console](#organization-console-organizationid) |
| API helpers & contracts | `src/lib/instance-api.md` (helper → endpoint contract) + `src/lib/instance-api.ts` |
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
| `pnpm check:vocabulary` | Reject daemon-as-agent and Apple-associated chrome phrasing (`src/lib/vocabulary.ts` + `scripts/check-vocabulary.mjs`) |
| `pnpm notices:generate` | Write `THIRD_PARTY_NOTICES.md` from the resolved pnpm graph plus committed bundled resources (fonts). After Expo prebuild / EAS, the same script collects CocoaPods, Gradle, and AAR/POM metadata (`--native`) |
| `pnpm notices:check` | JS-only (`--js-only`): fail when notices are stale vs the lockfile, or a production dependency has an unreviewed license class. Clean-checkout CI uses this so a missing native tree is not a failure |
| `pnpm notices:check:native` | Same check plus fail when a native build is expected but the CocoaPods / Gradle / AAR graph is absent. EAS `eas-build-post-install` generates with `--native` |
| `pnpm test` | Vitest once |
| `pnpm test:coverage` | Vitest + LCOV (`coverage/lcov.info`) — CI `verify.yml` runs this, then SonarCloud |

**Where to run tests:** host VirtFS checkouts lack a usable Node/pnpm tree
(`node_modules` is bind-mounted inside the guest). Run suites **inside the
Vagrant guest** from the host `dev` checkout. Canonical detail:
`../dev/AGENTS.md` → Testing. Do not run `pnpm test` on the host.

```bash
vagrant ssh -c 'export PATH="/opt/turbopanel/vendor/node/current/bin:$PATH"; cd ~/ui && pnpm test'
```

**CI:** `.github/workflows/verify.yml` runs lint, `check:vocabulary`, `notices:check`, typecheck, `pnpm test:coverage`,
then a SonarCloud scan with `sonar.qualitygate.wait=true` (`SONAR_TOKEN` required).
Automatic Analysis must stay **off** for `turbopanel_ui`.

**Pre-commit** (`.githooks/pre-commit`): secret scan only (never skippable).
Lint/typecheck/tests are **temporarily disabled** in the hook until the
toolchain can run inside the Vagrant guest. Requires `core.hooksPath=.githooks`
(otherwise Git never runs the hook).

- **`pnpm install`** runs `prepare` → `scripts/ensure-git-hooks.sh`, which sets `core.hooksPath=.githooks` locally.
- Dev console `./console` / `ensureAllGitHooksPaths` also wires every co-located checkout.
- After a fresh clone, run `pnpm install` (or `sh scripts/ensure-git-hooks.sh`) before committing; confirm with `git config --local --get core.hooksPath` → `.githooks`.
- **Pull-to-refresh is opt-in and focus-scoped.** `OrgScreenScroll` mounts `RefreshControl` only while a screen has registered a handler via `usePullToRefresh` (native only). Registrations are keyed per screen and held **only while that screen is focused** (`useIsFocused`): a native stack keeps the screen underneath mounted when you push a new one, so a single-slot registry let the projects list keep the gesture alive on the pushed create wizard, which has nothing to refresh. Keying also makes blur/focus teardown order irrelevant — a screen can only clear its own entry. Screens that never call `usePullToRefresh` (forms, wizards) get no RefreshControl.
- **`OrgScreenScroll` owns vertical scrolling for every org screen** (it is the org Stack's `screenLayout`, and each native tab-pager page) and applies the content `maxWidth` / `paddingHorizontal` / `paddingVertical` insets. Page-level sections must **not** nest their own vertical `ScrollView` — only horizontal ones for wide tables. A nested vertical scroll is unbounded on native, so `flexGrow: 1` + `justifyContent: 'center'` (a web-only way to vertically center a page) renders as large dead space above and below plus a second scroll surface on iOS.
- Lint/typecheck/tests still belong in CI/deploy and can be run manually with `pnpm lint` / `pnpm check:vocabulary` / `pnpm notices:check` / `pnpm typecheck` / `pnpm test` / `pnpm test:coverage`.
- **`pnpm lint` writes to the working tree.** `expo lint` applies ESLint autofixes, including `react-hooks/exhaustive-deps` on files you never touched — and widening a deps array changes when that effect re-runs. Check `git status` after linting and revert edits outside your change.

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
- Containers on Project Overview: `refetchInterval: false` — refresh only on explicit **Refresh** or after a tracked command reaches terminal status. **Exception:** inspect-only platform (system) projects poll with `observeUntilHostDeployed` until allocator pins gain a Docker id, because `system.reconcile` is not a user Deploy action.
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
| Frosted chrome | `src/lib/glass.ts` + `src/components/glass/glass-surface.tsx` (frosted surface; iOS 26+ `expo-glass-effect`) |
| Shared UI primitives | `src/components/ui/` — barrel `src/components/ui/index.ts` (see [Component layer](#component-layer)) |
| Shared panel patterns | `src/components/ui/panel-styles.ts` (`panelStyles`) |

**Page overrides that exist today** (do not invent others): `sign-in.md`, `about.md`, `overview.md`, `manage.md`, `organizations.md`, `servers.md`, `datacenters.md`, `server-detail.md`, `server-metrics.md`, `network.md`, `projects.md`, `project-create.md`, `managed-services.md`, `variables.md`, `service-settings.md`, `storage.md`, `tls.md`, `deploy-logs.md`, `container-logs.md`, `git-sources.md`. If no page file exists for a surface, follow Master only; add a page override when that surface needs durable exceptions.

### Component layer

The console ships to **three platforms** (web, iOS, Android) from one tree, so
shared chrome lives in **one** place and each screen composes it. A widget
hand-rolled per screen is a widget that renders three ways on three platforms
and drifts the moment one copy is edited.

**The layer:**

| Layer | Path | Rule |
| --- | --- | --- |
| Primitives | `src/components/ui/*` | Reusable, screen-agnostic. Imported everywhere via the `@/components/ui` barrel. |
| Shared panel styles | `src/components/ui/panel-styles.ts` | `panelStyles` — page titles, muted copy, detail cards, callouts, toolbar buttons. |
| Tokens | `src/lib/theme.ts` | `colors`, `chrome`, `spacing`, `layout`, `webPointer`. No one-off hex in components. |
| Features | `src/components/org/*`, `src/components/admin/*` | Screen-specific composition only. |

**Dependency direction is one-way: `ui/` must never import from `org/` or
`admin/`.** A primitive that needs a token takes it from `src/lib/theme.ts`.

**What already exists — check the barrel before writing a component.** Reach for
these instead of a local `StyleSheet`:

| Need | Use |
| --- | --- |
| On/off setting | `Toggle` + `SettingRow` — never React Native `Switch` (it renders as three unrelated controls across the platforms) |
| Panel / card | `SectionPanel` (`collapsible`, `accent`, `headerRight`) |
| Dense table | `DataTable` + `DataTableRow` / `DataTableCell` / `DataTableEmpty` — owns horizontal scroll, the web-only sticky header, hover, zebra, selection |
| Blocking dialog | `ModalSheet` — centred dialog on desktop, bottom sheet on compact, backdrop dismiss, Android back |
| Status indicator | `StatusDot` (`online` / `pending` / `offline` / `failed` / `neutral`); `ConnectionStatusDot` when a server's live pulse is wanted |
| Buttons | `Button`, `ButtonRow`, `ConfirmButton`, `CopyButton` |
| Inputs | `TextField`, `FormField`, `Checkbox`, `Select`, `SegmentedControl` |
| States | `EmptyState`, `LoadingState`, `InlineNotice`, `Badge`, `StatTiles`, `WizardSteps` |

**Adding a widget:** if a second screen needs it, it belongs in
`src/components/ui/` and the barrel — not copied. If only one screen will ever
use it, keep it local. Extend an existing primitive with a prop before adding a
near-duplicate component.

**Platform-specific styling belongs inside the primitive**, never in a screen.
Web-only CSS (`position: 'sticky'`, `overflowX`, `backdropFilter`) needs the
`as unknown as ViewStyle` cast; keeping it in one primitive means one cast
instead of one per screen (`DataTable` is the worked example).

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
- Soft elevation / hairline borders + restrained **frosted chrome** on shell chrome — **not** light SaaS, purple gradients, cyberpunk neon, or iridescent aberration
- Design dials already chosen: variance ~4, motion ~4, density ~8 (dashboard)
- Tokens only from `src/lib/theme.ts` (`colors` + `chrome`) and `src/lib/glass.ts` — no parallel hex systems
- **Platform copy:** user-facing “Workers / Cloudflare / edge” → **TurboPanel High Availability** (`HA_PRODUCT_NAME` in `src/lib/platform-copy.ts`). Never bare “High Availability” or “HA” in UI copy. The org mesh product is **TurboFabric** (`TURBOFABRIC_PRODUCT_NAME`) — never “tp0 fabric”, “which WireGuard network should this container join?”, or “the WireGuard mesh”. Backend identifiers unchanged. User-facing copy says **Platform CA** or **Organization CA**, never bare “CA certificate” / “org CA”.

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

**Shared UI kit (`src/components/ui/`, barrel `index.ts`):** `Badge`, `Button` / `ButtonRow`, `Checkbox`, `ConfirmButton`, `CopyButton`, `FormField` / `TextField`, `MonoText`, `SegmentedControl`, `EmptyState` / `LoadingState`, plus:
- `SectionNav` (`section-nav.tsx`) — a **short horizontal** strip of underline tabs for switching modes *within* a surface (the embedded Compose/Services toggle). Items take `icon` + optional `badge` and either `href` (routed, via `Link asChild`) or `onPress` (state-driven). There is deliberately **no rail variant**: a side list of destinations is what the project editor's layout exists to avoid, and a growing set of destinations belongs on the object it configures, not in a nav.
- `InlineNotice` (`inline-notice.tsx`) — left-accent state strip (title, optional body, optional actions that sit inline on wide layouts and wrap beneath the copy on narrow ones), `tone` `info` (default, `colors.command`) or `warning` (`colors.pending`). Use it wherever a message explains the content it sits above — **never** a modal or a scrim for that, which hides the very thing the message is about.
- `StatTiles` (`stat-tiles.tsx`) — icon-led count tiles **inside** a surface (fill-only, no border, auto-fit grid, zero values dimmed rather than hidden). Distinct from `StatusStatBoxes` (`org/status-stat-boxes.tsx`), which is the wider bordered label-first tile for page-level fleet numbers. Compose resource glyphs live in `src/components/icons/resource-icons.tsx`; compose nav glyphs in `org/compose-view-icons.tsx`.

**Shell polish (Phase 1):** shared patterns in `org-panel-styles.ts` (`pageTitle`, `toolbarBtn*`, `expandedSection`, `commandCodeBlock`, `statePanel`, `webPointer`). Org/admin sidebar brand via `TurboPanelLogo` (T mark only; full wordmark is website-only) + sub-nav rail; header eyebrow + borderless hover-tile account controls (`HeaderMenuTrigger`: org, user, notifications — leading icons sit in a 16px `triggerGlyph` slot matching the label line-height; native org switcher shows the display name truncated to `HEADER_ORG_NAME_MAX_CHARS` (20) plus chevron; native profile is a circular avatar with the user icon and optional unread badge, no chevron). Servers: status dots, zebra rows, expand cards. Metrics: collapsible chart groups + coverage bar. See `design-system/turbopanel/pages/servers.md`.

## End-user auth & first-run install (self-hosted)

- **Install** — `/install` when `needsInstall`. Step 1: host root or sudo user → `POST /install/bootstrap` (no cookies; UI reveals superadmin fields). Step 2: same host creds + superadmin email/password → `POST /install` → superadmin session → `/<organizationId>/overview`. `useCompleteInstall` optimistically clears `needsInstall` / `isInstallMode` before navigation. The install screen must not redirect to `/sign-in` after a successful complete (that raced AuthGuard).
- **AuthGuard** (`src/app/_layout.tsx`, logic in `src/lib/auth-guard.ts`) — always keep the root `<Stack />` mounted and render `<Redirect />` alongside it when a gate applies. Replacing Stack with Redirect alone leaves `useSegments()` empty so signed-in users loop on `/welcome` (`Maximum update depth exceeded`) right after install.
- **Control-plane targeting** (`src/lib/control-plane.ts`) — user sessions stay **HttpOnly cookies** (`credentials: 'include'`). There is no user-session Bearer. **Same-origin web** (production, or `__DEV__` behind Caddy `:8443` / `:8880`) keeps relative `/api` and has no picker or account switcher. **Standalone Expo web** (`__DEV__` + Metro origin, typically `:8081`) must **not** call the API — `/connect` is a static “open via Caddy” interstitial so Metro does not retry-loop. **Native** (iOS/Android) prefixes `resolveApiUrl` with the active origin; cookies live in the platform jar (one session per host). `/connect` picks **TurboPanel High Availability** (`https://turbopanel.app`) or a self-hosted URL; `needsInstall` tells the operator to finish setup in a browser on the host (no PAM install from the phone). Account metadata (origin, email, runtime) is stored without tokens; the header menu switches origins and calls `queryClient.clear()`. `pnpm start` / `ios` / `android` may prompt for `EXPO_PUBLIC_CONTROL_PLANE_URL` (written to gitignored `.env.development.local`); `pnpm web` and the systemd Expo unit do not.
- **Sign-up** — `/sign-up` when `isSignupEnabled` (from `GET /install/status`). Calls `POST /auth/sign-up`; no session is returned — user is redirected to `/sign-in` on success. Route is guest-only (authenticated users are redirected to dashboard). Not available when `needsInstall` is true. `sign-up.tsx` inlines `validatePassword` and `checkPwnedPassword` (no shared validation package). Pwned-password check uses `crypto.subtle.digest('SHA-1', …)` against `https://api.pwnedpasswords.com/range/{prefix}` with `Add-Padding: true` and a 5000ms timeout; fails open on error. The "Learn more" link hardcodes `https://turbopanel.io/docs/security/password-safety` — no `DOCS_BASE_URL` env var.
- **Sign-in** — `/sign-in` after install; superadmin **email** + password only (body `{ email, password }`; host accounts cannot sign in). Session has no `username` field — labels use `session.email`. Layout: centered column via `AuthScreenShell` (`src/components/auth/auth-screen-shell.tsx` + `auth-form-styles.ts`), form `maxWidth` 400 — **TurboPanel T mark** and **Sign In** title on one row above the form panel (mark left, title right-aligned; accent top edge on the **frosted chrome** panel via `GlassSurface`), `© {year} TurboPanel` copyright below. Shell backdrop (`AuthScreenBackground`): LinearGradient wash + tiled dashed SVG grid + vignette (`auth-grid-layer`) + 2×2 Reanimated accent streaks on random grid lines via shared values (skipped when reduced motion). Fields use floating labels (`AuthFloatingField`): resting label inside the field, shrinks to the top on focus/value; password toggle is eye / eye-slash icons (`auth-eye-icons.tsx`). **Accent by runtime** (`src/lib/auth-accent.ts` + `GET /api/client/v1/status` `runtime`): Workers / HA → blue `#3366cc`, Deno self-hosted → green `#3dd68c`. Bootstrap stores `controlPlaneRuntime`, persists it in `sessionStorage`, and calls `applyConsoleChromeRuntime` so signed-in `chrome.*` tokens resolve via CSS variables on web (hydrated on refresh before paint). Online status stays `colors.green`. Loading spinners (root AuthGuard + org layout) use `authSpinnerColor` — remembered runtime on refresh, muted only when unknown; never hardcode `colors.accent` on full-screen loaders. Sign In CTA spinner uses `onAccent`. Tokens in `src/lib/theme.ts` + `src/lib/glass.ts`; page override in `design-system/turbopanel/pages/sign-in.md`.
- **Dashboard** — `/welcome` after install/session restore: last or only org opens Overview (`defaultOrgDashboardHref`); otherwise `/organizations`. The header **View all organizations** action goes straight to `/organizations` and does not auto-leave.
- Session/install API shapes live in `src/lib/instance-api.ts` (`needsInstall`, `organizationId`).

The developer console has been moved to the [TurboPanel/dev](https://github.com/TurboPanel/dev) terminal console (`src/` in that repo).

## Project metadata

GitHub repository: [TurboPanel/ui](https://github.com/TurboPanel/ui). Package name: `@turbopanel/ui` (`package.json`).

Identifiers for Cloudflare and Expo deployments:

- `app.json` `slug`: `ui` — Expo project slug for web/EAS builds (`@turbopanel/ui`).
- `app.json` native IDs: iOS `ios.bundleIdentifier` and Android `android.package` are both **`app.turbopanel`** (required for GitHub-triggered EAS builds; reverse-DNS of [turbopanel.app](https://turbopanel.app)). Deep-link scheme is `turbopanel`. iOS `ITSAppUsesNonExemptEncryption` is `false` (HTTPS / standard APIs only). **GitHub iOS builds are non-interactive:** run one local `eas build -p ios --profile development` (or `eas credentials -p ios`) plus `eas device:create` so EAS has an Ad Hoc cert/profile before CI can sign `distribution: "internal"`.
- `wrangler.jsonc` top-level `name`: `ui` — Cloudflare Worker resource name; production deploy uses `env.live.name` `ui`.

## Build output & deployment (dev vs prod)

The UI is never installed as a standalone service tree — the **instance** repo's Caddy serves it, and the **daemon** installs its build output. Two modes (`TURBOPANEL_UI_MODE` on the instance):

- **Development** (`dev`) — `turbopanel-ui.service` runs the Expo web dev server on `:8081` (installed by the daemon `instance-launch` role, running as the **dev user**). Caddy reverse-proxies non-`/api`/`/ws` traffic to **`127.0.0.1:8081`**. The unit sets `NODE_OPTIONS=--dns-result-order=ipv4first` so Node `listen("localhost")` binds IPv4 (default is `[::1]`, which Caddy and Vagrant tunnels never hit — spinner stays on “Starting Expo dev server…”). Dev logs go to **`/var/log/turbopanel/ui`** (dev-user-owned).
  **Fast Refresh on Vagrant:** host saves on VirtioFS / 9p do not notify guest inotify, so Metro’s Linux `FallbackWatcher` never sees them (a full browser reload still works because Metro re-reads files). `metro.config.js` installs a poll watcher (`scripts/metro-virtfs-poll-watch.cjs`) when `/proc/mounts` shows those types. Override with `TURBOPANEL_METRO_POLL=1` (force) or `=0` (disable). Tamagui style extraction is off in development so Fast Refresh can apply. After changing Metro config, restart `turbopanel-ui`. Metro `blockList` / gitignore `/logs/` apply only to a **repo-root** dump — never `src/components/org/logs/` (that is `LogTranscriptView` source). Open the signed-in console via Caddy (`:8443` / `:8880`); Metro `:8081` is forwarded for native / Expo Go (same-origin cookies still will not work on the Metro origin). Web HMR is `/hot` on the Caddy origin.
- **Production** (`static`) — `pnpm export` produces the static web bundle; the daemon `ui-build` role publishes it to the FHS path **`/opt/turbopanel/share/ui`** (instance `TURBOPANEL_UI_ROOT` default). Caddy serves those files directly with SPA fallback and `turbopanel-ui.service` is stopped/disabled. Production runs as `tpctrl:tp`.

Both modes route through the single instance Caddy entrypoint; there is no separate `turbopaneld.service` or FHS tree owned by this repo. Canonical paths/units live in `../turbopanel/AGENTS.md` (Caddy + UI env vars) and `../turbopaneld/AGENTS.md` (Filesystem layout & path model).

## Organization console (`/<organizationId>/*`)

Moved to `src/app/[orgId]/AGENTS.md` — layout/chrome, area routes, instance
API usage, servers/metrics pages, compose panels. Read it before editing
anything under `src/app/[orgId]/`.

## Admin area (`/admin/*`)

Moved to `src/app/admin/AGENTS.md`.

## Command Pipeline UI

Per-server command actions use `src/components/org/server-commands-panel.tsx` on the server detail **Control** tab. Commands follow a create-then-poll pattern: the UI enqueues via a mutation hook, receives a `commandId`, then polls with `useCommandsBatch` from `src/lib/queries/commands.ts` (`COMMAND_POLL_MS`, `isTerminalCommandStatus`) — a single React Query with `refetchInterval` while any tracked command is non-terminal. Each tick is **one** `POST /commands/status` request for every tracked id (via `fetchCommandStatuses`), not one `GET` per command; results are re-aligned to entry order so index-based consumers stay correct, and unreadable ids simply drop out. `useCommandRecordsBatch` is the per-id variant (one `fetchCommand` per entry, full `CommandRecord`) kept for the server-detail Control tab, which renders the ping latency breakdown. No hand-rolled `setInterval` per page or per server.

### API helpers — `src/lib/instance-api.ts`

- `pingDaemon(serverId)` → `POST /api/client/v1/servers/:id/commands/ping` — returns `CommandEnqueueResponse`: `{ ok: true, commandId, status }`.
- `setServerHostname(serverId, hostname)` → `POST /api/client/v1/servers/:id/hostname` — returns the same `CommandEnqueueResponse` shape: `{ ok: true, commandId, status }`.
- `rebootServer(serverId)` → `POST /api/client/v1/servers/:id/commands/reboot` — returns `CommandEnqueueResponse`.
- `fetchCommand(serverId, commandId)` → `GET /api/client/v1/servers/:id/commands/:commandId` — returns `CommandRecord`; for `daemon.ping` commands the response includes optional `latency` (`PingLatencyBreakdown`).
- `fetchCommandStatuses(ids)` → `POST /api/client/v1/commands/status` — one request for many tracked ids (max 100, deduped server-side); returns `CommandStatusRecord[]`. Ids the session cannot read are omitted from the response rather than failing the batch. This is the polling path; `fetchCommand` stays for the single-command detail view that needs `latency` / `result`.
- Types: `CommandStatus` (string union of all statuses), `PingLatencyBreakdown`, `CommandRecord`, `CommandStatusRecord`, `CommandEnqueueResponse`.
- `CommandStatusRecord` is the lean lifecycle projection — `{ id, serverId, status, type, queuedAt, startedAt, finishedAt, errorCode, errorMessage, hasLog }`. No `payload`, `result`, `attempts`, or `latency`; read `errorMessage` (not `error`) for the failure text.
- The `CommandRecord` shape is flat (all lifecycle timestamps are top-level fields). The instance serializes it from **real `command` columns** — `status`, `attempts`, `error_code`, `error_message`, `result_summary`, and every granular lifecycle timestamp (`queued_at`…`finished_at`, `expires_at`) are columns, not a jsonb blob. `metadata` is **no longer** the source of those fields: it survives only as the follow-up-chain blob (`pendingStandbyApplies`, `followUpPromote`, `pendingTlsLeaf`, `desiredHash`) and never reaches the UI. `CommandRecord` still **excludes the dispatch payload** — that lives in the separate `dispatch` table and is never serialized to a client. See `turbopanel/src/lib/commands/AGENTS.md` and `turbopanel/src/lib/db/AGENTS.md`.

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

### Execution logs (command transcripts)

Command stdout/stderr is captured by the daemon, uploaded as redacted NDJSON
`CommandOutputEvent` lines, and read back through
`GET /api/client/v1/servers/:id/commands/:commandId/log?from=&max=`
(`fetchCommandLog` → `CommandLogResponse`). `from` is a **chunk** sequence, not a
byte offset; poll with the previous response's `nextSeq`. `exists: false` is the
"not started" state — the route never 404s a poll loop, so "waiting for output"
and "no transcript retained" stay distinguishable.

- Hook: `useCommandLog(orgId, serverId, commandId)` in
  `src/lib/queries/execution-logs.ts`. One React Query per open transcript;
  `refetchInterval` is `COMMAND_LOG_POLL_MS` (1 s) only while the latest read is
  not `sealed`, then `false`. Pass `poll: false` for an already-terminal command.
  Chunks accumulate in a ref keyed by `(serverId, commandId)` and are deduped by
  event sequence, because a read whose byte budget split a chunk replays it with
  an unchanged `nextSeq`.
- Parsing lives in `src/lib/execution-log-lines.ts`: NDJSON events become
  `LogTranscriptLine[]`; plain-text lines (the store's truncation marker, legacy
  output) degrade to `stdout` rows instead of being dropped. ANSI is **stripped**,
  never interpreted.
- Rendering is one shared component,
  `src/components/org/logs/log-transcript-view.tsx` — used by the Overview deploy
  transcript, the deployment-history rows, the managed **Apply transcript**, the
  managed **Engine logs** tail, and the per-container live tail on the
  environment containers panel. Do not fork it per surface; see
  `design-system/turbopanel/pages/deploy-logs.md`. The viewer is a fixed-height
  nested scroll with a visible scrollbar; **Deployment history** caps its row
  list the same way (`environment-deployment-history-panel.tsx`).

### Container logs (live tail)

Container stdout/stderr is **not retained**. There is no fleet-wide explorer,
no org `containerLogsEnabled` switch, and no stored page. The console tails
**one** running container on demand:

- `GET /api/client/v1/containers/:id/logs` — correlated cell round trip; the
  daemon runs `docker container logs` and returns the bytes. Nothing is stored.
- Hook: `useContainerLogTail` in `src/lib/queries/containers.ts` (`enabled: false`
  by default; optional Follow is a refetch cadence, not a host `--follow`).
- Rendering: `LogTranscriptView` on the environment containers panel
  (`src/components/org/logs/container-log-tail.tsx`). Do not fork a second viewer.

Do not reintroduce a Logs org area, `/<orgId>/logs` routes, a presence-ack
collector flag, or a fleet-wide `GET /organizations/:id/container-logs` scan.

### Deploy history

`GET /api/client/v1/environments/:id/deployments` (`fetchEnvironmentDeployments`)
reads the append-only `command` table — `deployment` is upsert-per-(environment,
server) current state and cannot list past deploys. A row's `id` **is** the
command id, so the same id fetches the transcript. Multi-host deploys arrive as
several rows sharing one `generation`; the UI groups them client-side
(`src/lib/deployment-history.ts`) instead of fanning out to
`/deployments/:deploymentId` per row. `useEnvironmentDeployments` never polls —
it is invalidated by `invalidateEnvironmentSubtree` (deploy/lifecycle mutations)
and when a tracked deploy command reaches a terminal status.

### Ping / hostname / reboot

- Surface on the server detail **Control** tab via `ServerCommandsPanel`.
- Mutations: `usePingDaemon` / `useSetServerHostname` / `useRebootServer` from `src/lib/queries/servers.ts`.
- In-flight command ids feed `useCommandsBatch`; terminal success invalidates the server detail key.
- Hostname/reboot gated by `useCan(…, 'organization:manage')` as a display hint; disabled when `!server.connected`.
- Reboot uses two-step confirm. Do not add per-server background polling loops — O(1) shared batch query only.
