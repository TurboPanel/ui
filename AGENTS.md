# AGENTS.md

Expo web UI for TurboPanel. Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Documentation discipline

**Keep this file current.** When you learn something durable about the UI — instance API shapes, developer/diagnostic panels, fetch patterns, Expo constraints — add or update a note here alongside code changes.

- Prefer extending an existing section over orphan bullets.
- Record **why** when non-obvious.
- API contracts live in `src/lib/instance-api.ts`; mirror instance changes there and note breaking shapes here.
- Do not record secrets or environment-specific URLs as if they were universal.
- Remove or correct notes that prove wrong.

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

## Stack

- **Tamagui** `^2.0.0-rc.26` — configured via `babel.config.cjs` (not `app.json` plugins); `reactCompiler` experiment is disabled to avoid conflicts with the Tamagui babel plugin.
- **React Query** `^5.90.14` — module-level `QueryClient` in `src/app/_layout.tsx`; `useAuthStatus()` hook in `src/lib/query-client.ts`.
- **Fonts** — `@tamagui/font-inter` OTF files loaded in `RootLayout` via `useFonts`; layout returns `null` until fonts are ready.

## End-user auth & first-run install (self-hosted)

- **Install** — `/install` when `needsInstall`. Step 1: host root or sudo user → `POST /install/bootstrap` (no cookies; UI reveals superadmin fields). Step 2: same host creds + superadmin email/password → `POST /install` → superadmin session → `/<organizationId>/servers`.
- **Sign-up** — `/sign-up` when `isSignupEnabled` (from `GET /install/status`). Calls `POST /auth/sign-up`; no session is returned — user is redirected to `/sign-in` on success. Route is guest-only (authenticated users are redirected to dashboard). Not available when `needsInstall` is true. `sign-up.tsx` inlines `validatePassword` and `checkPwnedPassword` (no shared validation package). Pwned-password check uses `crypto.subtle.digest('SHA-1', …)` against `https://api.pwnedpasswords.com/range/{prefix}` with `Add-Padding: true` and a 5000ms timeout; fails open on error. The "Learn more" link hardcodes `https://turbopanel.io/docs/security/password-safety` — no `DOCS_BASE_URL` env var.
- **Sign-in** — `/sign-in` after install; superadmin email + password only (host accounts cannot sign in).
- **Dashboard** — `/<organizationId>/servers` once install completes (`session.organizationId`).
- Session/install API shapes live in `src/lib/instance-api.ts` (`needsInstall`, `organizationId`).

The developer console has been moved to the [turbopanel/dev](https://github.com/turbopanel/dev) terminal console (`src/` in that repo).

## Project metadata

GitHub repository: [turbopanel/ui](https://github.com/turbopanel/ui). Package name: `@turbopanel/ui` (`package.json`).

Identifiers for Cloudflare and Expo deployments:

- `app.json` `slug`: `turbopanel` — Expo project slug for web/EAS builds.
- `wrangler.jsonc` top-level `name`: `ui` — Cloudflare Worker resource name; production deploy uses `env.live.name` `ui`.

## Build output & deployment (dev vs prod)

The UI is never installed as a standalone service tree — the **instance** repo's Caddy serves it, and the **daemon** installs its build output. Two modes (`TURBOPANEL_UI_MODE` on the instance):

- **Development** (`dev`) — `turbopanel-ui.service` runs the Expo web dev server on `:8081` (installed by the daemon `instance-launch` role, running as the **dev user**). Caddy reverse-proxies non-`/api`/`/ws` traffic to it. Dev logs go to **`/var/log/turbopanel/ui`** (dev-user-owned).
- **Production** (`static`) — `pnpm export` produces the static web bundle; the daemon `ui-build` role publishes it to the FHS path **`/opt/turbopanel/share/ui`** (instance `TURBOPANEL_UI_ROOT` default). Caddy serves those files directly with SPA fallback and `turbopanel-ui.service` is stopped/disabled. Production runs as `turbopaneli:turbopanel`.

Both modes route through the single instance Caddy entrypoint; there is no separate `turbopaneld.service` or FHS tree owned by this repo. Canonical paths/units live in `../instance/AGENTS.md` (Caddy + UI env vars) and `../daemon/AGENTS.md` (Filesystem layout & path model).

## Organization console (`/<organizationId>/*`)

Main product shell for signed-in users. Web uses a left sidebar with area tabs and per-area sub-menus; native will likely move the top-level areas to bottom tabs later.

### Layout

- `src/app/[orgId]/_layout.tsx` — auth guard + `OrgShell`
- `src/components/org/org-shell.tsx` — responsive shell (sidebar on web, drawer on narrow viewports)
- `src/components/org/org-sidebar.tsx` — area nav + sub-routes for the active area
- `src/components/org/org-header.tsx` — page title, user label, sign out
- `src/lib/org-navigation.ts` — area registry (`ORG_AREAS`); add entries + routes together

### Areas (routes)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/<orgId>/servers` | `servers-overview-section.tsx` | Servers assigned to the signed-in org (`GET /api/client/v1/servers`) |
| `/<orgId>/servers/networks` | `networks-overview-section.tsx` | Networks sub-page under Servers |
| `/<orgId>/workspaces` | `workspaces-overview-section.tsx` | Workspaces list (`GET /api/client/v1/workspaces`) |
| `/<orgId>/projects` | `projects-overview-section.tsx` | Projects list (optional `?workspaceId` filter) |
| `/<orgId>/projects/new` | `project-create-section.tsx` | Type picker + catalog + name form |
| `/<orgId>/projects/[projectId]` | `project-detail-section.tsx` | Project details + `environments-overview-section.tsx` |
| `/<orgId>/projects/[projectId]/[environmentId]` | `environment-detail-section.tsx` | Environment details + `variables-section.tsx` |
| `/<orgId>/access` | `access-overview-section.tsx` | Permission grant management (`GET/POST/DELETE /api/client/v1/access`) |

### Adding a new organization area

1. Add the area (and sub-routes) to `ORG_AREAS` in `src/lib/org-navigation.ts`
2. Create `src/app/[orgId]/<area>/<subroute>.tsx` route wrappers
3. Create section components under `src/components/org/`

### Instance API

Types and helpers: `src/lib/instance-api.ts` (auth, install, org servers, health). Update when `/api/client/v1` or `/api/install/v1` endpoints change.

Authorization helpers:

- `GET /api/client/v1/permissions` → `fetchPermissions()`
- `GET /api/client/v1/access?resourceId=<uuid>` → `fetchAccessGrants(resourceId)` — returns `{ access: AccessGrantRecord[] }`; each row carries `subjectKind`, `subjectId`, `resourceId`, `effect`, and `permissionKey`
- `GET /api/client/v1/access/resource-id?kind=<organization|team>&itemId=<uuid>` → `resolveResourceId(kind, itemId)`
- `POST /api/client/v1/access` → `createAccessGrant(body: CreateAccessBody)` — body: `{ resourceId, subjectKind, subjectId, effect, permissionKey }`; grant targets are organization or team entities only
- `DELETE /api/client/v1/access/:id` → `revokeAccessGrant(id)`
- `POST /api/client/v1/invitations/:id/accept` → `acceptInvitation(id)`
- `fetchVisibleWorkspaces()` → `GET /api/client/v1/workspaces`
- `fetchVisibleProjects(workspaceId?)` → `GET /api/client/v1/projects` (optional `?workspaceId=` filter)
- `fetchProjectCatalog()` → `GET /api/client/v1/project-catalog` — returns `{ catalog: CatalogSummary[] }`
- `fetchProject(id)` → `GET /api/client/v1/projects/:id`
- `createProject(body: CreateProjectBody)` → `POST /api/client/v1/projects`
- `updateProject(id, body)` → `PATCH /api/client/v1/projects/:id`
- `deleteProject(id)` → `DELETE /api/client/v1/projects/:id` — `PROJECT_HAS_CHILDREN_ERROR` when environments exist
- `fetchVisibleEnvironments(projectId?)` → `GET /api/client/v1/environments`
- `fetchEnvironment(id)` → `GET /api/client/v1/environments/:id`
- `createEnvironment(body)` → `POST /api/client/v1/environments`
- `updateEnvironment(id, body)` → `PATCH /api/client/v1/environments/:id`
- `deleteEnvironment(id)` → `DELETE /api/client/v1/environments/:id`
- `fetchVariables(environmentId)` → `GET /api/client/v1/variables?environmentId=`
- `fetchVariable(id)` → `GET /api/client/v1/variables/:id`
- `createVariable(body)` → `POST /api/client/v1/variables`
- `updateVariable(id, body)` → `PATCH /api/client/v1/variables/:id`
- `deleteVariable(id)` → `DELETE /api/client/v1/variables/:id`
- Types: `ProjectRecord` (`metadata.type`, `options.compose`), `EnvironmentRecord` (`metadata`, `options.compose`), `CatalogSummary`, `VariableRecord`, `CreateProjectBody`
- **Secret write-only rule:** `VariableRecord.value` is always `null` when `isSecret` is true — the UI must never display or pre-fill secret values; use masked placeholders and write-only update forms
- `fetchServerUpdate(serverId)` → `GET /api/client/v1/servers/:id/update` — returns `ServerUpdateStatus` with `current`/`target` commit identity and `updateAvailable`.
- `triggerServerUpdate(serverId)` → `POST /api/client/v1/servers/:id/update` — triggers a trunk update on the connected daemon; requires `organization:manage`.
- The Update button is gated by `useCan('organization', orgId, 'organization:manage')` as a display hint; the server enforces the real 403. Non-managers see commit rows read-only with no button.

#### Server status reads — Postgres only

- Server online/offline status, `lastInboundAt`, `connectedAt`, `hostname`, and `remoteAddress` all come from `GET /api/client/v1/servers` (Postgres-backed, no Durable Object reads).
- Batch update status comes from `GET /api/client/v1/servers/updates` (single call for all servers).
- Per-server status is available via `fetchServerStatus(id)` → `GET /api/client/v1/servers/:id/status` (Postgres-backed).
- **Never call `fetchServerCell()` from a timer or from any normal status view.** It hits the Durable Object directly and is admin/debug-only. It is annotated as such in `instance-api.ts`.
- Do not add per-server polling loops. N servers must not produce N repeated DO or Redis calls. The servers page must issue O(1) status calls regardless of fleet size.
- The same Postgres-only status semantics hold identically on Workers (Cloudflare) and self-hosted (Deno/Redis) modes.
- `DaemonCellSnapshot` / `FetchServerCellResponse` types remain in `instance-api.ts` for admin surfaces only; do not import them in normal org views.
- Durable Object billing, cell storage schema, and the "no DO polling / O(1) status reads" rationale are canonical in `../instance/AGENTS.md` (Daemon Cell); UI must never introduce per-server DO/Redis reads.

`useCan(scopeKind, itemId, permissionKey)` in `src/lib/query-client.ts` is a **display hint only** — never a security boundary. On `403`, call `handleUnauthorized()` from `useAuth()` to clear the session and redirect.

## Admin area (`/admin/*`)

Instance-wide administration for users with the `admin` or `superadmin` role.

### Layout

- `src/app/admin/_layout.tsx` — role guard (`superadmin` or `admin` via `isAdminSession`); non-admins redirect to their dashboard
- `src/lib/admin-navigation.ts` — area registry (`ADMIN_AREAS`); add entries + routes together
- `src/components/admin/admin-shell.tsx`, `admin-sidebar.tsx`, `admin-header.tsx` — responsive shell (mirrors org console)

### Areas (routes)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/admin/networking` | `control-plane-urls-section.tsx` | Control-plane public URLs and TLS cert SANs |

### Instance API

Admin helpers in `src/lib/instance-api.ts` (`ADMIN_API = '/api/admin/v1'`):

- `fetchPublicUrls()` → `GET /api/admin/v1/instance/public-urls`
- `savePublicUrls(urls)` → `PUT /api/admin/v1/instance/public-urls`
- `applyPublicUrls(urls?)` → `POST /api/admin/v1/instance/public-urls/apply` (Deno self-hosted only)

When apply returns 422 with `"cert apply is not applicable on this runtime"` (Workers), hide the Apply button and show an informational note instead.

`useCan` is display-only; rely on server 403s and `handleUnauthorized()`.

## Command Pipeline UI

Per-server command actions are implemented in `src/components/org/server-commands-panel.tsx` (presentational UI) with orchestration in `src/components/org/servers-overview-section.tsx`. Commands follow a create-then-poll pattern: the UI calls the create endpoint, receives a `commandId`, then polls `fetchCommand` until the status is terminal (`succeeded`, `failed`, or `timed_out`). A single shared timer in `servers-overview-section.tsx` coalesces polling for all in-flight commands — no per-server intervals.

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

### Ping Daemon button

- Visible per server card; requires no special permission (read access is sufficient).
- On click: calls `pingDaemon(serverId)`, registers the `commandId` with the shared command poll coordinator in `servers-overview-section.tsx` (`COMMAND_POLL_MS = 2_000`).
- Stops polling when status is `succeeded`, `failed`, or `timed_out`.
- On `succeeded`: renders the latency breakdown table inline below the button.
- On `failed`/`timed_out`: renders the error message inline.
- Reuses `orgPanelStyles`, `colors`, `spacing`, and existing badge/button styles.

### Change Hostname

- Gated by `useCan('organization', orgId, 'organization:manage')` as a **display hint only** — the server enforces the real 403. On 403 response, call `handleUnauthorized()`.
- Disabled when the server's `connected` field is `false` (daemon offline — from Postgres status, no extra call).
- On submit: validates non-empty client-side, calls `setServerHostname(serverId, hostname)`, registers with the shared command poll coordinator until terminal.
- On `succeeded`: refreshes the server list (re-fetches `GET /api/client/v1/servers`) so the new hostname appears.
- On `failed`: shows the error inline.

### Reboot Server

- `rebootServer(serverId)` → `POST /api/client/v1/servers/:id/commands/reboot` — returns `CommandEnqueueResponse`.
- Gated by `canManage` (display hint only; server enforces 403).
- Disabled when `!server.connected` or any command is in flight.
- Two-step confirm: first press shows "Confirm reboot?" + Confirm/Cancel; only Confirm calls `onReboot`.
- Polled via the shared `COMMAND_POLL_MS` coordinator — no new timer.
- On `succeeded`: triggers a silent server list refresh (`refreshServers({ silent: true })`).
- On `failed`/`timed_out`: surfaces `rebootError` inline.

Poll only while a command is in flight. Do not add per-server background polling loops. N servers must not produce N repeated calls. This is the same O(1) rule as the existing status read model.
