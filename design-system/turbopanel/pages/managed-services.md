# Page Override: Managed Services

> Overrides `design-system/turbopanel/MASTER.md` for managed engine projects.

**Routes:**
- `/[orgId]/managed` — org-wide managed services overview (`managed-overview-section.tsx`)
- `/[orgId]/projects/new` — managed branch of the create wizard
- `/[orgId]/projects/[projectId]` — managed detail (`managed-project-section.tsx`) when `metadata.type === 'managed'`

**Job:** See every managed service in the org at a glance, create a managed engine project (Postgres first), pin a server, reveal the root password once, then operate the service from six dense panels at the project detail route (exactly one detail surface).

---

## Org overview (`/[orgId]/managed`)

Dense ops table backed by a **single** `GET /organizations/:id/managed` call (`fetchOrganizationManaged`). No per-row status polling and no Durable Object reads.

| Column | Notes |
|--------|--------|
| Engine | Catalog badge (`PostgreSQL`, …) |
| Name | Managed display name (fallback project / engine) |
| Project | `project / environment` |
| Server | Host display name |
| Status | Pill via `managedStatusLabel` (Running / Stopped / Provisioning / Applying / Failed) + status dot — same vocabulary as servers fleet |
| Endpoint | `host:port`, or **Not exposed** |

- **Row press** → `/[orgId]/projects/[projectId]` (managed project detail)
- **Filters** (client-side over the loaded list): engine, status, server
- **+ Managed service** → create flow; gated by `useCan('organization', orgId, 'organization:manage')` as a display hint only
- **Empty state** links to the managed create flow when the operator can manage
- **Refresh:** one restrained interval on the org list query (same O(1) spirit as servers fleet)

Visual: reuse `orgPanelStyles` + servers overview table / zebra / status-dot patterns.

---

## Create flow (four questions)

Wizard progress labels: **Type → Engine → Details → Server** (then a show-once secret step outside the progress rail).

1. **Type** — pick Managed
2. **Engine** — catalog cards (`ManagedEngineAvailability`: Available / Coming soon). Only `available` is pressable. Show default port + image from `MANAGED_SERVICE_CATALOG`.
3. **Details** — name (+ workspace picker only when scope is ambiguous). No description field.
4. **Server** — connected servers selectable; offline rows disabled with an Offline hint. Optional **Expose on port** (off by default; prefill engine `defaultPort`; validate with `isValidPublishedPort`). Bind scope is **not** offered here.

Submit: `POST /projects` (`type: 'managed'`, `code`, `serverId`) → load Production environment → `POST …/managed` with optional exposure → **SecretReveal**.

Failure after project creation: surface `managedErrorMessage` and offer **Open project** (detail page Set up can retry).

### Show-once secret pattern

- Shared `SecretReveal` (`calloutWarning` + `commandCodeBlock` + Copy)
- Copy: *"This password is shown once. You will not be able to see it again."*
- Clear plaintext on dismiss / unmount
- Same component for create, root rotation, and user creation

---

## Managed project detail

Same URL as compose projects. Header keeps the `managed` badge; body is `ManagedProjectSection` (skip principals / compose / project variables / compose environments). Keep Workspace move.

Environment tabs mirror compose projects (auto-create Production once, rename / new / delete). Body:

| Panel | Notes |
|-------|--------|
| Connection | Host, port, database, username, masked DSN + copy; Provisioning… / Not exposed when no connection |
| Credentials | Root username; Rotate password → show-once reveal |
| Users & databases | Add/delete DBs and users; two-press delete; show-once user password |
| Backups | Rows: timestamp, size, database, short checksum. **Back up now** (primary); **Restore** behind a typed confirmation (type the managed/project display name — spells out data loss, same pattern as Lifecycle delete); **Delete** as the two-press pattern. Empty state when none exist; disabled with an explanatory hint when the engine has no backup capability (Postgres only today). Metadata-only — no download endpoint, dump bytes never cross the API |
| Lifecycle | Start / Stop / Restart / Apply / Delete (typed confirm like project delete) |
| Settings | **Collapsed by default** (“Advanced settings”); image, SSL, engine config (16 KiB), Docker options, resources, backup retention (keep-N), exposure + bind chips; one Apply → PATCH settings then apply |
| Status & logs | Status pill via `managedStatusLabel` (Running / Stopped / Provisioning / Applying / Failed — same vocabulary as servers fleet); container rows via shared `ContainerStatusBadge`; logs on-demand only (tail 200/500/1000) |

### Restore confirmation copy rule

Restore is destructive and irreversible (it overwrites the current database from the dump). The confirmation must:

- Name the target database being overwritten
- State plainly that it cannot be undone
- Require typing the managed service / project display name (exact match) before **Confirm restore** becomes pressable — never a single-click destructive action

### O(1) read rule

- Status from Postgres (`fetchManagedStatus`); poll only while `provisioning` / `applying`
- Logs never on a timer (each refresh is a live daemon round-trip)
- One shared command-poll timer per managed project for every mutation (`COMMAND_POLL_MS`)

---

## Data model

Uses the **`managed`** table + **`principal(managed_id)`**:

- One managed row per **environment** (`environment_id`, unique partial index)
- Engine identity from project catalog code (`postgres`, …)
- Root + DB user creds sealed as `enc` on principal rows
- Runtime status: `provisioning` \| `applying` \| `ready` \| `stopped` \| `failed`

## Visual

- Engine catalog pills: Available / Coming soon
- Status pills match servers fleet labels (not color alone)
- Action-first panels — no hero blocks
- Tokens only from `src/lib/theme.ts`; reuse `org-panel-styles` (`detailCard`, `calloutWarning`, `commandCodeBlock`, `expandedSection`, `segmentGroup`, `toolbarBtn*`)
