# Page Override: Projects

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/projects` and project detail.

**Routes:** projects overview, create, `[projectId]/*` tabbed shell  
**Job:** Organize work by workspace; configure type; edit compose / managed panels via tabs; place environments on servers; deploy.

---

## Layout

- Overview: workspace switcher + project list (workspace label when viewing all); **setup** badge when type is unset
- Detail: **Project shell** — header, environment selector, horizontal tabs (scroll on phone), tab body
- Compose/Template tabs: Overview · Environments · Networking · Storage · Settings
- Overview: opens on **Base** by default at `/overview` (no `?env=`). Compact **Base / environment** segmented toggle + optional inline **Default server** pin (inherited by unpinned environments) + refined Start / Stop / Refresh / Destroy when an environment is selected (`/environments/:environmentId` — that env highlighted, not Base). Services: Base Compose editor until an environment is started (any running/pending container); then collapsed rows with green / yellow / red dots (running / pending / stopped). Edit compose anytime under Settings.
- Managed tabs: Overview · Environments · Data · Backups · Settings
- Single environment: shell shows name (no chip strip); multi-env: chip selector on non-Overview tabs keeps selection in memory (Overview uses path `/environments/:id`)
- Service detail deep links remain under `/services/:id`; `/services` redirects to Overview
- Base Compose also remains under Settings for editing after start

## Creation / setup

1. **Create** (`/projects/new`) — name + workspace → `POST type=empty` (Production once) → `/setup`
2. **Setup** — choose Compose / template / managed (+ catalog); resumable when `metadata.type` is unset
3. Configured stopped projects are complete — do not show as incomplete

## Density

- Tab targets ≥ 44pt; horizontal scroll ok on phone
- Settings hub uses drill-down rows (not one giant form)
- Service detail and hosting deep links under `/services/:id` and `/networking/:id`

## Anti-patterns (page-specific)

- ❌ Giant stacked project detail as primary experience  
- ❌ Project-level server placement (environment-owned only)  
- ❌ Showing secret variable values after create  
- ❌ Managed projects exposing Compose UI  
- ❌ Auto-polling deploy preview  
