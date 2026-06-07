# AGENTS.md

Expo web UI for TurboPanel. Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Documentation discipline

**Keep this file current.** When you learn something durable about the UI — instance API shapes, admin/diagnostic panels, fetch patterns, Expo constraints — add or update a note here alongside code changes.

- Prefer extending an existing section over orphan bullets.
- Record **why** when non-obvious.
- API contracts live in `src/lib/instance-api.ts`; mirror instance changes there and note breaking shapes here.
- Do not record secrets or environment-specific URLs as if they were universal.
- Remove or correct notes that prove wrong.

## Admin console (`/admin/*`)

Dev-only admin shell at `/admin/*` (landing at `/` links to `/admin/fleet`). No auth.

### Layout

- `src/components/admin/admin-shell.tsx` — full-viewport shell: sidebar + header + content slot
- `src/components/admin/admin-sidebar.tsx` — section nav from `ADMIN_SECTIONS`
- `src/components/admin/admin-header.tsx` — persistent API health + fleet target chips
- `src/lib/admin-context.tsx` — `AdminProvider` / `useAdmin()` for shared polling and fleet state
- `src/lib/admin-navigation.ts` — section registry (add nav entry + route + section component)
- `src/lib/admin-theme.ts` — shared colors and layout tokens

### Sections (routes)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/admin/fleet` | `fleet-section.tsx` | Health, connected agents detail |
| `/admin/network` | `network-section.tsx` | Interface IP addresses |
| `/admin/shell` | `shell-section.tsx` | Remote commands |
| `/admin/connectivity` | `connectivity-section.tsx` | Echo broadcast + websocket log |

`AdminProvider` polls every 2s: `/api/health`, `/api/daemon/connections`, `/api/daemon/events`, `/api/daemon/commands`. Target selection (`__all__` or per-daemon id) lives in the header and is shared across Network and Shell.

### Adding a new admin section

1. Add entry to `ADMIN_SECTIONS` in `src/lib/admin-navigation.ts`
2. Create `src/app/admin/<id>.tsx` route (thin wrapper)
3. Create `src/components/admin/<id>-section.tsx` using `SectionPanel`

### Instance API

Types and helpers: `src/lib/instance-api.ts` (`daemonLabel`, `formatEvent`, `uniqueFleetConnections`, …). Update when instance endpoints change.
