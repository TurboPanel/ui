# Page Override: Projects

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/projects` and project detail.

**Routes:** projects overview, create, `[projectId]/*` tabbed shell  
**Job:** Organize work by workspace; configure type; edit compose / managed panels via tabs; place environments on servers; deploy.

---

## Layout

- Overview: full-width workspace bar under the page title (click expands inline search + workspace list) + project list (workspace label when viewing all); **setup** badge when type is unset
- Detail: **Project shell** — breadcrumb title **Projects ›** type glyph (`ProjectTitleIcon`) + project name + compose **Project · environments** scope chips (`ProjectScopeSelector` in the project header). Managed projects keep a header trash for delete; compose projects have **no** header trash — all compose delete (project and environment) lives in the **Settings** area (`ProjectSettingsArea` → Settings chip → Danger). Environment selector (managed / non-Overview tabs), section tabs, tab body
- Compose: **Project · environments** scope chips in the project header (`ProjectScopeSelector`). Networking / Storage section routes (`/networking`, `/storage`) redirect to the current scope path when an environment scope is already active, otherwise Overview (no first-env invent on cold load). Hosting deep links `/networking/:id` preserve `?hostingId=` so Settings can expand the matching hosting row. Project / env chips *are* the compose surface; env detail lives under the selected environment. Collapsible settings (`ProjectSettingsArea` in `src/components/org/project-settings-area.tsx`) sits below the compose panels — **not** a stack of empty sections. **Project scope:** quiet **Add Server / Add Variable / Add System user** chips; clicking one reveals that resource section (also auto-shows when data already exists). **Settings** chip reveals Workspace, **Keep original container names** toggle (default Off = rename; On warns that rolling updates are disabled), and Danger → Delete project. **Environment scope:** **Add Server / Add Network / Add Storage** chips with the same reveal pattern; **Settings** reveals Danger → Delete environment
- Scope banner: `ComposeScopeBanner` (`src/components/org/project/compose-scope-banner.tsx`) above the editor. **Project** scope: no banner (saved view title **Compose - Project**). **Environment** scope: inheriting (with **Create override** / **Start from project compose**) vs overriding (with **Clear overrides**, two-press) plus an inherited-services chip hint
- **Preview Deployment** (`PreviewDeploymentModal`): opens only when deploying / redeploying an environment (Overview **Deploy** / **Redeploy** / **Cacheless redeploy**, or Environments **Deploy**). Not shown for project-level compose editing or lifecycle Start/Stop of already-deployed containers. Modal title **Preview Deployment**; Merged / Prepared toggle (Prepared defaults); Confirm enqueues deploy. Fetch prepared preview on open only — never auto-poll
- Overview: opens on **Project** by default at `/overview` (no `?env=`). No outer panel chrome — saved-compose view card (summary chips + read-only YAML; **Edit** mounts Compose/Services) sits flush on the page. Edit chrome: **Compose / Services** tabs left; right-aligned **Discard Changes** + **Save**. Lifecycle **Deploy / Redeploy ▾ / Start / Stop / Refresh / Destroy** sits below when an environment is selected (`/environments/:environmentId`). After start, service status rows appear on the view card with green / yellow / red dots.
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
- ❌ Always-on "What will run" / effective-compose panel on the project editor (preview lives in **Preview Deployment** at deploy time only)  
- ❌ Preview Deployment modal on project-level compose scope or for lifecycle Start/Stop of already-deployed containers  
- ❌ Separate Overview / Environments section tabs next to Project / env chips (one group only)  
- ❌ Networking / Storage visible while Project (base) compose is selected  
- ❌ Reintroducing section chips (Networking / Storage / Servers) in the editor toolbar  
- ❌ Putting delete back in the project header for compose projects  
- ❌ Showing an environment editor with no inheritance / scope statement above it (banner-less editing)  
- ❌ Stack of empty Settings sections for every resource type (use Add chips; reveal sections when opened or when data exists)  
- ❌ Treating a user workspace named “System” as platform-managed  
- ❌ Compose editor / lifecycle / delete chrome on system projects  
