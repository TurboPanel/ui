# Page Override: Projects

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/projects` and project detail.

**Routes:** projects overview, create, `[projectId]/*` tabbed shell  
**Job:** Organize work by workspace; configure type; edit compose / managed panels via tabs; place environments on servers; deploy.

---

## Layout

- Overview: full-width workspace bar under the page title (click expands inline search + workspace list) + project list (workspace label when viewing all); **setup** badge when type is unset
- Detail: **Project shell** — header with project name + compose **Project · environments** scope chips (`ProjectScopeSelector` in the project header). Managed projects keep a header trash for delete; compose projects have **no** header trash — all compose delete (project and environment) lives in the **Settings** area (`ProjectSettingsArea` → Danger). Environment selector (managed / non-Overview tabs), section tabs, tab body
- Compose: **Project · environments** scope chips in the project header (`ProjectScopeSelector`). Networking / Storage section routes (`/networking`, `/storage`) redirect to the current scope path when an environment scope is already active, otherwise Overview (no first-env invent on cold load). Hosting deep links `/networking/:id` preserve `?hostingId=` so Settings can expand the matching hosting row. Project / env chips *are* the compose surface; env detail lives under the selected environment. Collapsible **Settings** area (`ProjectSettingsArea` in `src/components/org/project-settings-area.tsx`) sits below the compose / effective-compose panels — **Project scope** (`ProjectSettingsSections`): Servers, Variables, Container naming, Workspace, System users, Danger → Delete project; **Environment scope** (`EnvironmentSettingsSections`): Server, Networking, Storage, Danger → Delete environment
- Scope banner: `ComposeScopeBanner` (`src/components/org/project/compose-scope-banner.tsx`) above the editor. **Project** scope: "Project compose (base)" + environment count. **Environment** scope: inheriting (with **Create override** / **Start from project compose**) vs overriding (with **Clear overrides**, two-press) plus an inherited-services chip hint
- **What will run** (`EffectiveComposePanel`): segmented **Merged** / **Prepared** toggle. **Merged** — client-side `mergeComposeOverlay` + `withEffectivePlacement`, always available (including Project scope). **Prepared** — server `deploy-preview`, requires an environment + server pin; disabled on Project scope
- Overview: opens on **Project** by default at `/overview` (no `?env=`). No outer panel chrome — editor surface and Save sit flush on the page. One bordered editor surface header: quiet **Compose / Visual** underline tabs (left) plus **Set Default Project Server (Optional)** (right). Scope chips live in the project header, not this surface. Lifecycle Start / Stop / Refresh / Destroy sits below when an environment is selected (`/environments/:environmentId`). After start, collapsed service rows with green / yellow / red dots.
- Managed tabs: Overview · Environments · Data · Backups
- Single environment: shell shows name (no chip strip) on managed non-Overview tabs; multi-env: chip selector on those tabs keeps selection in memory (compose Overview uses path `/environments/:id`)
- Service detail deep links remain under `/services/:id`; `/services` redirects to Overview
- Delete: compose — **Danger** rows in `ProjectSettingsArea` (two-press environment delete when multiple exist; `ProjectDeletePanel` for project delete). Managed — header trash can (same two-press / project-wizard behavior). Old `/settings` routes redirect to Overview. Bare compose `/environments` redirects to Overview.

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
- ❌ Reintroducing section chips (Networking / Storage / Servers) in the editor toolbar  
- ❌ Putting delete back in the project header for compose projects  
- ❌ Showing an environment editor with no inheritance / scope statement above it (banner-less editing)  
- ❌ Treating a user workspace named “System” as platform-managed  
- ❌ Compose editor / lifecycle / delete chrome on system projects  
