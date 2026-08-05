# Page Override: Projects

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/projects` and project detail.

**Routes:** projects overview, create, `[projectId]/*` tabbed shell  
**Job:** Organize work by workspace; configure type; edit compose / managed panels via tabs; place environments on servers; deploy.

---

## Layout

- Overview: full-width workspace bar under the page title (click expands inline search + workspace list) + project list (workspace label when viewing all); **setup** badge when type is unset
- Detail: **Project shell** — header with red trash delete (environment when multiple exist; otherwise project), environment selector (managed / non-Overview tabs), section tabs, tab body
- Compose: one unified tab group — **Project · environments · Networking · Storage**. Networking / Storage only appear after an environment is selected (hidden on Project compose). No separate Overview or Environments section tabs — Project / env chips *are* the compose surface; env detail lives under the selected environment. Networking focuses on hostnames/ports — no compose overlay editor (edit overlays on Overview or Settings → overrides).
- Overview: opens on **Project** by default at `/overview` (no `?env=`). No outer panel chrome — editor surface and Save sit flush on the page. One bordered editor surface header: quiet **Compose / Visual** underline tabs (left) plus **Set Default Project Server (Optional)** and the **Project / environment / section** segment buttons (right). Section tabs leave the shell on Overview so they live in that surface header; Networking / Storage keep the same unified group in the shell. Lifecycle Start / Stop / Refresh / Destroy sits below when an environment is selected (`/environments/:environmentId`). After start, collapsed service rows with green / yellow / red dots.
- Managed tabs: Overview · Environments · Data · Backups
- Single environment: shell shows name (no chip strip) on managed non-Overview tabs; multi-env: chip selector on those tabs keeps selection in memory (compose Overview uses path `/environments/:id`)
- Service detail deep links remain under `/services/:id`; `/services` redirects to Overview
- Delete: header trash can — two-press confirm deletes the selected environment when more than one exists; with a single environment it opens the project-delete wizard. Old `/settings` routes redirect to Overview. Bare compose `/environments` redirects to Overview.

## Creation / setup

1. **Create** (`/projects/new`) — name + workspace → `POST type=empty` (Production once) → `/setup`
2. **Setup** — choose Compose / template / managed (+ catalog); resumable when `metadata.type` is unset
3. Configured stopped projects are complete — do not show as incomplete

## Density

- Tab targets ≥ 44pt; horizontal scroll ok on phone
- Service detail and hosting deep links under `/services/:id` and `/networking/:id`

## System / platform projects

- Detection is by `workspace.kind === 'system'` (and optional `project.metadata.component`) — **never** by display name.
- System projects are **compose-shaped but read-only**: no compose editor, no lifecycle Start/Stop/Destroy, no delete, no workspace move, no Networking/Storage chips.
- Overview shows a platform panel (component key, target server, container status + name) plus optional read-only YAML; Restart when `system:operate` permits.
- Platform badge label is **Platform** (SVG shield/gear + text — never emoji); paired with existing type badge on the System workspace project list.
- All-workspaces scope hides system projects; they appear only when the System workspace is explicitly selected.

## Anti-patterns (page-specific)

- ❌ Giant stacked project detail as primary experience  
- ❌ Project-level server placement (environment-owned only)  
- ❌ Showing secret variable values after create  
- ❌ Managed projects exposing Compose UI  
- ❌ Auto-polling deploy preview  
- ❌ Separate Overview / Environments section tabs next to Project / env chips (one group only)  
- ❌ Networking / Storage visible while Project (base) compose is selected  
- ❌ Treating a user workspace named “System” as platform-managed  
- ❌ Compose editor / lifecycle / delete chrome on system projects  
