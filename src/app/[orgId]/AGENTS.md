# Organization console (`/<organizationId>/*`) — AGENTS.md

Repo-wide rules (design system, tokens, platform copy, testing): `../../../AGENTS.md`.

Main product shell for signed-in users. Web keeps the sidebar + narrow-viewport drawer (`org-shell.tsx`); iOS/Android use `org-shell.native.tsx` with `OrgTabBar` (Overview, Projects, Servers). `ORG_TAB_AREA_IDS` is the native tab set; Managed / Network / Access / Workspaces / Admin / Pending keys remain deep-link-only on native for now. **Manage Organization** is not a sidebar area — reach it from the header org switcher **Manage** button, a gear on `/organizations`, or a deep link.

## Layout

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

## Areas (routes)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/<orgId>/overview` | `overview-section.tsx` | Org glance — hairline status tiles (Servers · Cores · RAM; Servers = green online + offline suffix) |
| `/<orgId>/servers` | `servers-overview-section.tsx` | Fleet Detail/Summary — batch update, row/tile opens control panel |
| `/<orgId>/servers/[serverId]` | `server-detail-section.tsx` | Server control panel (Overview, Control, Time, Network, Metrics tabs) |
| `/<orgId>/servers/datacenters` | `datacenters-overview-section.tsx` | Org datacenter inventory (private subnets). A datacenter is a routing domain of one or more mutually routable subnets. Empty list + **+ Datacenter** (no auto-opened create form). **+ Datacenter** when ≥1 server reports a private IP; opens `/servers/datacenters/new` |
| `/<orgId>/servers/datacenters/new` | `datacenter-form-section.tsx` | Create form (name, description, server + IP dropdowns → first subnet). After create, opens datacenter detail |
| `/<orgId>/servers/datacenters/[datacenterId]` | `datacenter-detail-section.tsx` | Name/description; Subnets (rows + Add subnet); Routing (address preference); member pins (server + IP dropdowns, both families, only IPs inside this datacenter’s subnets); TurboFabric relays; timezone; two-press delete when empty |
| `/<orgId>/servers/keys` | `pending-keys-section.tsx` | Unused registration keys (not bound to a server). Owner-only; two-press delete. Reached from the Servers sidebar. |
| `/<orgId>/servers/settings` | `server-timezone-settings-section.tsx` + `server-host-defaults-settings-section.tsx` + `server-capacity-settings-section.tsx` | Org default timezone, host defaults (SSH / NTP / TurboFabric preference), server seat capacity (`maxServers`) |
| `/<orgId>/servers/tls` | `tls-overview-section.tsx` | Org TLS — Organization CA panel (rotate / retire) above the uploaded / self-signed / Let's Encrypt library |
| `/<orgId>/network` | `network/network-overview-section.tsx` | Hub linking Datacenters, TurboFabric, Addresses, and Docker networks (private subnet CRUD lives on Datacenters) |
| `/<orgId>/network/addresses` | `network/network-addresses-section.tsx` | Org address pool (`public` / `datacenter`) |
| `/<orgId>/network/docker` | `network/network-docker-section.tsx` | Docker external network registry for compose |
| `/<orgId>/network/fabric` | `network/network-fabric-section.tsx` | TurboFabric opt-in mesh + relay table + Apply (not required for standalone Docker) |
| `/<orgId>/projects` | `projects-overview-section.tsx` | Projects list; optional `?workspaceId` from the filter (omit = **All workspaces**) |
| `/<orgId>/projects/new` | `project-create-section.tsx` | Create **wizard** (`project-create/`): Details (name, description, existing/new workspace) → **Next** → Type → compose draft *or* catalog pick → **Create project**. Nothing is written until Create — no half-made project to delete after a mis-click. Type cards are **Compose · Services · Git repository · Template · Managed**; all three of the first are `docker-compose` — Compose and Services differ only in which compose-surface tab opens (`SetupTypeOption.section`), and Git repository adds a picker step (`project-create/repository-step.tsx`) that seeds the draft with one service carrying `x-turbopanel.source` (`project-create/repository-seed.ts`) before handing it to the same `ComposeStep`. Key the cards off `option.choice`, never `option.type` — three cards share a type, so `type` yields duplicate React keys. `parsePreselectedChoice` matches card ids **before** project types, so a bare `?type=docker-compose` lands on Compose rather than on whichever card happens to be first. Card copy must not imply TurboPanel hosts or runs anything (it is self-hosted; Managed means we configure the engine on the operator's own servers). The **compose step is the project screen itself**, not a wizard copy of it — see **Draft project surface** below. `?type=` skips the type cards (`repository` included); `?workspaceId=` preselects the workspace. Resumable setup (`project-setup-section.tsx`) reuses `SETUP_TYPE_OPTIONS` but filters **Git repository** out — `configureProject` carries `{ type, code }` with no `options.compose`, so a binding would be silently dropped |
| `/<orgId>/projects/settings` | `default-environment-settings-section.tsx` | Org default environment name (`GET`/`PUT /organizations/:id/default-environment`) |
| `/<orgId>/projects/git-sources` | `git-sources/git-sources-section.tsx` | The organization's Git **applications** — a collection, not a pair of singletons. Instance-wide apps appear here as `readOnly` rows beside the org's own. **Create a GitHub App** opens `git-sources/github-app-wizard.tsx` in place (never a modal); **Add manually** opens `git-sources/forge-editor.tsx` for an App or OAuth application registered by hand. This surface deliberately does **not** list repositories — a `repository` row is created when a project attaches one and is never managed on its own. The same component serves `/admin/git` with `scope="admin"`. Page override: `design-system/turbopanel/pages/git-sources.md` |
| `/<orgId>/projects/git-sources/[appId]` | `git-sources/forge-detail-section.tsx` | One application: **Repository access** (the `connection` rows it reached, **Suspended** badge, and the *Complete GitHub installation* empty state — registering an App and installing it are two acts, and an App with no installation looks configured while seeing no repository), the **Webhook** URL with its reachability note, and **Sync from GitHub**. Reads `?installed=` / `?error=` off the provider redirect — both callbacks **302** back here, never leaving the operator on API JSON. Install/connect actions are `Linking.openURL(githubAppInstallUrl() | gitlabOauthConnectUrl())`; both endpoints answer **302** to the provider consent page, so they are navigated to, never fetched |
| `/<orgId>/projects/[projectId]` | tabbed project shell (`project/_layout` + tabs) | Header breadcrumb: **Projects ›** type glyph (`ProjectTitleIcon`) + project name + the compose **Project · environments** scope selector. Overview defaults to **Project** compose at `/overview` (no `?env=`). Selecting an environment uses `/environments/:environmentId` (same Overview UI; that env highlighted, not Project). Hosting / Servers / Storage / Settings are compose **surface tabs** (Project and environment) reached from the surface **section nav** — there is no scope-chip settings gear. Bare `/environments` redirects to Overview. Shell environment selector is for managed non-Overview tabs. Unconfigured projects redirect to `/setup`. Service detail remains at `/services/:id`. |
| `/<orgId>/projects/[projectId]/setup` | `project-setup-section.tsx` | Resumable type / catalog selection for projects that already exist untyped. Selection is local until **Finish setup** (`POST …/configure`); shares `project-create/` cards and copy |
| `/<orgId>/projects/[projectId]/environments/[environmentId]` | `ProjectOverviewTab` | Overview with that environment selected (path-based; no query) |
| `/<orgId>/managed` | `managed/managed-overview-section.tsx` | Org-wide managed services table (`GET /organizations/:id/managed`); engine / status / server filters; row opens the managed project detail |
| `/<orgId>/managed/settings` | `managed/managed-defaults-settings-section.tsx` | Org defaults inherited by managed databases — client TLS mode and shared-ProxySQL listener ports (`GET`/`PUT …/managed-defaults`, manage-gated) |
| `/<orgId>/access` | `access-overview-section.tsx` | Permission grant management (`GET/POST/DELETE /api/client/v1/access`) |
| `/<orgId>/manage` | `manage-section.tsx` | **Manage Organization** — view name / ID / created date; managers can rename (`PATCH /organizations/:id`). Reached from the header org switcher **Manage** button or a gear on `/organizations`, not the sidebar |
| `/<orgId>/workspaces` | `workspaces-overview-section.tsx` | Workspace CRUD (reached via switcher **Manage workspaces**, not the sidebar) |
| `/<orgId>/workspaces/[workspaceId]` | `workspace-detail-section.tsx` | Workspace detail + projects in workspace |

## Adding a new organization area

1. Add the area (and sub-routes) to `ORG_AREAS` in `src/lib/org-navigation.ts`
2. Create `src/app/[orgId]/<area>/<subroute>.tsx` route wrappers
3. Create section components under `src/components/org/`

## Environments (project Environments tab)

Moved to [`projects/AGENTS.md`](./projects/AGENTS.md) — environments tab,
overview Compose panel, service panels.

## Workspaces

- Workspaces are a **project-organization filter**, not a primary sidebar area. The Projects page **workspace filter** defaults to **All workspaces** and always offers that option (last choice may be restored from localStorage / `?workspaceId=`). Choosing a workspace opens `/projects?workspaceId=…`; choosing All opens `/projects`. The TurboPanel workspace (`kind=turbopanel`) appears as a same-height row with a Platform badge.
- Management CRUD lives at `/workspaces` (list/create/edit/detail) and is reached from the switcher (**Manage workspaces** / **Create workspace**), not from `ORG_AREAS`.
- List: `workspaces-overview-section.tsx` (`GET /api/client/v1/workspaces`). Edit forms: `workspace-form-section.tsx`. Name validation is shared via `src/lib/workspace-validation.ts`.
- **Create workspace wizard:** when the user can `organization:own`, `WorkspacesOverviewSection` renders the reusable `first-run-wizard.tsx` **above** the list `SectionPanel` as a friendly inline create form (title “Create a workspace”). Creates via `createWorkspace`, then refreshes the list + shared switcher query. New orgs already have a **Default Workspace** from install / Workers sign-up — this wizard is for adding more. Non-owners see the list only (empty copy when none exist).
- `FirstRunWizard` is presentational only (title, description, optional notes, optional name field, primary action) and is intended for reuse on other guided create screens.
- Projects overview copy and create links follow the active scope; the all-workspaces view labels each project with its workspace name.

## Instance API

Types and helpers live in `src/lib/instance-api.ts`. The full helper →
endpoint contract (auth, projects, environments, repositories, servers,
managed, …) is maintained in [`../../lib/instance-api.md`](../../lib/instance-api.md)
— **update it whenever `/api/client/v1` or `/api/install/v1` endpoints or
`instance-api.ts` helpers change.**

## Servers pages

Moved to [`servers/AGENTS.md`](./servers/AGENTS.md) — overview table, control
panel, add-server flow, metrics page, Postgres-only status reads.
