# AGENTS.md

Expo web UI for TurboPanel. Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Documentation discipline

**Keep this file current.** When you learn something durable about the UI — instance API shapes, developer/diagnostic panels, fetch patterns, Expo constraints — add or update a note here alongside code changes.

- Prefer extending an existing section over orphan bullets.
- Record **why** when non-obvious.
- API contracts live in `src/lib/instance-api.ts`; mirror instance changes there and note breaking shapes here.
- Do not record secrets or environment-specific URLs as if they were universal.
- Remove or correct notes that prove wrong.

## Stack

- **Tamagui** `^2.0.0-rc.26` — configured via `babel.config.cjs` (not `app.json` plugins); `reactCompiler` experiment is disabled to avoid conflicts with the Tamagui babel plugin.
- **React Query** `^5.90.14` — module-level `QueryClient` in `src/app/_layout.tsx`; `useAuthStatus()` hook in `src/lib/query-client.ts`.
- **Fonts** — `@tamagui/font-inter` OTF files loaded in `RootLayout` via `useFonts`; layout returns `null` until fonts are ready.

## End-user auth & first-run install (self-hosted)

- **Install** — `/install` when `needsInstall`. Step 1: host root or sudo user → `POST /install/bootstrap` (no cookies; UI reveals superadmin fields). Step 2: same host creds + superadmin email/password → `POST /install` → superadmin session → `/<organizationId>/servers/overview`.
- **Sign-up** — `/sign-up` when `isSignupEnabled` (from `GET /install/status`). Calls `POST /auth/sign-up`; no session is returned — user is redirected to `/sign-in` on success. Route is guest-only (authenticated users are redirected to dashboard). Not available when `needsInstall` is true. `sign-up.tsx` inlines `validatePassword` and `checkPwnedPassword` (no shared validation package). Pwned-password check uses `crypto.subtle.digest('SHA-1', …)` against `https://api.pwnedpasswords.com/range/{prefix}` with `Add-Padding: true` and a 5000ms timeout; fails open on error. The "Learn more" link hardcodes `https://turbopanel.io/docs/security/password-safety` — no `DOCS_BASE_URL` env var.
- **Sign-in** — `/sign-in` after install; superadmin email + password only (host accounts cannot sign in).
- **Dashboard** — `/<organizationId>/servers/overview` once install completes (`session.organizationId`). Legacy `/<organizationId>/overview` redirects there.
- **Developer console** — in `__DEV__`, authenticated shell pages show a **Developer console** nav link to `/developer/fleet` (superadmin session required by `developer/_layout.tsx`).
- Session/install API shapes live in `src/lib/instance-api.ts` (`needsInstall`, `organizationId`).

## Organization console (`/<organizationId>/*`)

Main product shell for signed-in users. Web uses a left sidebar with area tabs and per-area sub-menus; native will likely move the top-level areas to bottom tabs later.

### Layout

- `src/app/[orgId]/_layout.tsx` — auth guard + `OrgShell`
- `src/components/org/org-shell.tsx` — responsive shell (sidebar on web, drawer on narrow viewports)
- `src/components/org/org-sidebar.tsx` — area nav + sub-routes for the active area
- `src/components/org/org-header.tsx` — page title, user label, sign out, dev console link
- `src/lib/org-navigation.ts` — area registry (`ORG_AREAS`); add entries + routes together

### Areas (routes)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/<orgId>/servers/overview` | `servers-overview-section.tsx` | Servers assigned to the signed-in org (`GET /api/client/v1/servers`) |
| `/<orgId>/servers/networks` | `networks-overview-section.tsx` | Networks sub-page under Servers |

### Adding a new organization area

1. Add the area (and sub-routes) to `ORG_AREAS` in `src/lib/org-navigation.ts`
2. Create `src/app/[orgId]/<area>/<subroute>.tsx` route wrappers
3. Create section components under `src/components/org/`

## Developer console (`/developer/*`)

**Dev-only** developer shell at `/developer/*`. No auth on the developer API surface itself, but the layout requires a **superadmin** session (`role === 'superadmin'`). It must never ship in a production build.

### Layout

- `src/components/developer/developer-shell.tsx` — full-viewport shell: sidebar + header + content slot
- `src/components/developer/developer-sidebar.tsx` — section nav from `DEVELOPER_SECTIONS`
- `src/components/developer/developer-header.tsx` — persistent API health + fleet target chips; **Organization console** exits to `dashboardHref`
- `src/components/developer/developer-sidebar.tsx` — same exit link at the top of the nav
- `src/lib/developer-context.tsx` — `DeveloperProvider` / `useDeveloper()` for shared polling and fleet state
- `src/lib/developer-navigation.ts` — section registry (add nav entry + route + section component)
- `src/lib/theme.ts` — shared colors and layout tokens (used by the developer console and the landing page)

### Sections (routes)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/developer/fleet` | `fleet-section.tsx` | Health, connected server nodes detail |
| `/developer/network` | `network-section.tsx` | Interface IP addresses |
| `/developer/shell` | `shell-section.tsx` | Remote commands |
| `/developer/connectivity` | `connectivity-section.tsx` | Echo broadcast + websocket log |
| `/developer/database` | `database-section.tsx` | Postgres connection test, Drizzle Studio, reset dev instance |
| `/developer/expo` | `expo-section.tsx` | Expo dev server terminal — tmux PTY stream + keypress input |
| `/developer/servers` | `servers-section.tsx` | Registered server rows; assign each to an organization |

`DeveloperProvider` polls every 2s: `/api/health`, `/api/developer/v1/daemon/connections`, `/api/developer/v1/daemon/events`, `/api/developer/v1/daemon/commands`. Target selection (`__all__` or per-daemon id) lives in the header and is shared across Network and Shell.

The fleet section also exposes operator actions (no auto-update — everything is operator-driven):

- **Upgrade System** — `POST /api/developer/v1/system/upgrade` (disabled while `GET …/system/upgrade-status` reports dirty instance, daemon, or UI checkouts)
- **Sync Dev Build** — `POST /api/developer/v1/daemon/sync-dev`; the instance tars its local daemon checkout and pushes it to all agents over the websocket (no git push/pull), which restart.
- **Save Tunnel Token** — `POST /api/developer/v1/instance/tunnel-token`; sets/clears the instance's Cloudflare tunnel token so the co-located daemon runs cloudflared.

The database section exposes **Reset Dev Instance** — `POST /api/developer/v1/system/reset-dev` (drops public schema, repushes `schema.ts`, restarts instance). On success the UI navigates to `/recovering?reason=reset`, polls public health/install endpoints only, then redirects to `/install` or `/sign-in`.

### Adding a new developer section

1. Add entry to `DEVELOPER_SECTIONS` in `src/lib/developer-navigation.ts`
2. Create `src/app/developer/<id>.tsx` route (thin wrapper)
3. Create `src/components/developer/<id>-section.tsx` using `SectionPanel`

### Instance API

Types and helpers: `src/lib/instance-api.ts` (`daemonLabel`, `formatEvent`, `uniqueFleetConnections`, …). Update when instance endpoints change.

**Versioned surfaces.** The instance exposes `/api/client/v1` (this end-user UI, greenfield), `/api/developer/v1` (dev-only developer console), and `/api/daemon/v1` (agents); `/api/health` is the single unversioned probe. All developer calls go through the `DEVELOPER_API = '/api/developer/v1'` constant in `instance-api.ts` (single choke point) — prefix new developer endpoints there, never hard-code paths in components. WS surfaces `/ws/{client,developer}/v1` exist as stubs for future live streaming (the UI polls today). `/api/admin/v1` + `/ws/admin/v1` are reserved for a future instance-admin surface.

`EXPO_PTY_WS_PATH = '/ws/developer/v1/expo-pty'` — WebSocket for the Expo log stream. Client→server: `{ type: 'resize', cols, rows }` (sizes the tmux window to the log panel), `{ type: 'input', data: string }` (quick-key / keyboard input via `send-keys`). Server→client: `{ type: 'snapshot', data: string }` — plain `tmux capture-pane -p` polled ~4×/s, rendered in a monospace `<pre>` (not xterm — avoids ANSI/cursor replay artifacts from Metro). Session name: `expo-ui`. Socket opens only when `healthOk === true`; unmount/`healthOk` drop suppresses reconnect timers.
