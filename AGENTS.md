# AGENTS.md

Expo web UI for TurboPanel. Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Documentation discipline

**Keep this file current.** When you learn something durable about the UI — instance API shapes, admin/diagnostic panels, fetch patterns, Expo constraints — add or update a note here alongside code changes.

- Prefer extending an existing section over orphan bullets.
- Record **why** when non-obvious.
- API contracts live in `src/lib/instance-api.ts`; mirror instance changes there and note breaking shapes here.
- Do not record secrets or environment-specific URLs as if they were universal.
- Remove or correct notes that prove wrong.

## Instance API (dev admin panel)

The temporary admin console is `src/components/daemon-test-panel.tsx`. It talks to same-origin `/api/*` (proxied by Caddy to the instance).

- Polls `/api/daemon/connections`, `/api/daemon/events`, `/api/daemon/commands`, `/api/health`
- **Fleet** bar: target selector (All + per-server); labels use `hostname` from connections, falling back to connection id
- `uniqueFleetConnections()` dedupes by hostname → `nodeId` → `remoteAddress` → id
- **Diagnostics** tabs: Network (addresses), Shell (remote commands), Connectivity (echo + activity log)
- Types and helpers: `src/lib/instance-api.ts` (`daemonLabel`, `formatEvent`, …)

When adding instance endpoints, update `instance-api.ts` types and this section.
