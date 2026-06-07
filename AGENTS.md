# AGENTS.md

Expo web UI for TurboPanel. Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Documentation discipline

**Keep this file current.** When you learn something durable about the UI — instance API shapes, developer/diagnostic panels, fetch patterns, Expo constraints — add or update a note here alongside code changes.

- Prefer extending an existing section over orphan bullets.
- Record **why** when non-obvious.
- API contracts live in `src/lib/instance-api.ts`; mirror instance changes there and note breaking shapes here.
- Do not record secrets or environment-specific URLs as if they were universal.
- Remove or correct notes that prove wrong.

## Developer console (`/developer/*`)

**Dev-only** developer shell at `/developer/*` (landing at `/` links to `/developer/fleet` only when `__DEV__`). No auth. This is the console a developer uses to babysit a development instance and its development nodes; it must never ship in a production build. `src/app/developer/_layout.tsx` redirects to `/` when `!__DEV__`, and the instance only serves `/api/developer/*` in dev mode (see the instance `src/dev-mode.ts`). `admin` is intentionally reserved for a future *instance admin* surface — do not reuse it here.

### Layout

- `src/components/developer/developer-shell.tsx` — full-viewport shell: sidebar + header + content slot
- `src/components/developer/developer-sidebar.tsx` — section nav from `DEVELOPER_SECTIONS`
- `src/components/developer/developer-header.tsx` — persistent API health + fleet target chips
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
| `/developer/database` | `database-section.tsx` | Postgres connection test + Drizzle Studio |

`DeveloperProvider` polls every 2s: `/api/health`, `/api/developer/v1/daemon/connections`, `/api/developer/v1/daemon/events`, `/api/developer/v1/daemon/commands`. Target selection (`__all__` or per-daemon id) lives in the header and is shared across Network and Shell.

The fleet section also exposes operator actions (no auto-update — everything is operator-driven):

- **Upgrade System** — `POST /api/developer/v1/system/upgrade` (disabled while `GET …/system/upgrade-status` reports dirty instance, daemon, or UI checkouts)
- **Sync Dev Build** — `POST /api/developer/v1/daemon/sync-dev`; the instance tars its local daemon checkout and pushes it to all agents over the websocket (no git push/pull), which restart.
- **Save Tunnel Token** — `POST /api/developer/v1/instance/tunnel-token`; sets/clears the instance's Cloudflare tunnel token so the co-located daemon runs cloudflared.

### Adding a new developer section

1. Add entry to `DEVELOPER_SECTIONS` in `src/lib/developer-navigation.ts`
2. Create `src/app/developer/<id>.tsx` route (thin wrapper)
3. Create `src/components/developer/<id>-section.tsx` using `SectionPanel`

### Instance API

Types and helpers: `src/lib/instance-api.ts` (`daemonLabel`, `formatEvent`, `uniqueFleetConnections`, …). Update when instance endpoints change.

**Versioned surfaces.** The instance exposes `/api/client/v1` (this end-user UI, greenfield), `/api/developer/v1` (dev-only developer console), and `/api/daemon/v1` (agents); `/api/health` is the single unversioned probe. All developer calls go through the `DEVELOPER_API = '/api/developer/v1'` constant in `instance-api.ts` (single choke point) — prefix new developer endpoints there, never hard-code paths in components. WS surfaces `/ws/{client,developer}/v1` exist as stubs for future live streaming (the UI polls today). `/api/admin/v1` + `/ws/admin/v1` are reserved for a future instance-admin surface.
