# Page Override: Projects

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/projects` and project detail.

**Routes:** projects overview, create, `[projectId]/*` tabbed shell  
**Job:** Organize work by workspace; configure type; edit compose / managed panels via tabs; place environments on servers; deploy.

---

## Layout

- Overview: compact workspace **filter** under the page title (defaults to **All workspaces**; expands to equal-height list) + project list (workspace label when viewing all); **setup** badge when type is unset
- Detail: **Project shell** — breadcrumb title **Projects ›** type glyph (`ProjectTitleIcon`) + project name + compose **Project · environments** scope chips (`ProjectScopeSelector` in the project header). Managed projects keep a header trash for delete; compose projects have **no** header trash — all compose delete (project and environment) lives in the **scope-chip settings gear** (`ProjectSettingsPanel` / `EnvironmentSettingsPanel` → Danger). Section tabs, tab body
- Compose surface tabs: **Overview · Compose · Services** live *inside* the bordered editor chrome (underline strip), not as a shell strip under the header. Scope chips stay Project · environments; switching Project ↔ environment **keeps the active section tab**. Settings live in a **gear dropdown** on each scope chip (not below compose). **Project gear:** quiet **Add Server / Add Variable / Add System user** chips plus Workspace, **Keep original container names** toggle (default Off = rename; On warns that rolling updates are disabled), and Danger → Delete project. **Environment gear:** **Add Server / Add Network / Add Storage** chips plus Danger → Delete environment. Add Storage creates identity + primary location + optional mount (`pages/storage.md`). Sections reveal when opened or when data already exists. `?hostingId=` auto-opens the environment gear panel.
- Scope banner: `ComposeScopeBanner` (`src/components/org/project/compose-scope-banner.tsx`) only when an environment has compose overrides (**Clear overrides**, two-press). Inheriting environments have no banner — the **Compose** tab starts a blank overlay
- **Preview Deployment** (`PreviewDeploymentModal`): lifecycle **Preview ▾** (inspect: Merged compose / Prepared compose) and **Deploy / Redeploy / Cacheless redeploy** (confirm enqueue). Modal titles **Compose Preview** vs **Confirm Deployment**. **Merged** keeps service-level `x-turbopanel` metadata (placement stays on the environment, not YAML). **Prepared** is the server deploy-preview (no auto-poll). Not shown for project-level compose or Start/Stop.
- **Overview** (`/overview` or `/environments/:id`): opens on **Project** by default. Inventory strip + topology **diagram only** (no Diagram/YAML toggle; no Edit button). YAML is the Compose tab.
  - **Inventory strip** (`ComposeInventoryStrip`) — a `value · label` row (matching the fleet-overview totals pattern) counting resources at the active scope: Project scope shows environments / servers (distinct, across environments) / services / networks / volumes / storage; Environment scope shows server (0/1) / services / networks / volumes / storage / bindings, all scoped to that environment (no N+1 fetches).
  - **Diagram** (`ComposeGraphView`, `src/lib/compose/graph.ts`) — Overview body: cross-platform `react-native-svg` node graph (services as cards with a status dot when deployed, networks as pill "bus" connectors, volumes as dashed resource tags), laid out top-to-bottom by `depends_on`, with a color legend and accessibility text fallback (`describeComposeGraph`). Empty when there are no nodes; blank compose shows “No compose defined yet.”
- **Compose** tab (`/compose`, `/environments/:id/compose`): YAML editor + **Save** inside the same surface (tabs remain in the chrome header).
- **Services** tab (`/services`, `/environments/:id/services`): visual service forms + **Save**.
- Lifecycle **Preview ▾ / Deploy / Redeploy ▾ / Start / Stop / Refresh / Destroy** sits below when an environment is selected. After start, service status rows appear on Overview with green / yellow / red dots (mirrored on diagram service nodes).
- Managed tabs: Overview · Connect · Data · Backups · Environments (shell strip — managed only)
- Single environment: shell shows name (no chip strip) on managed non-Overview tabs; multi-env: chip selector on those tabs keeps selection in memory (compose scope uses path `/environments/:id`)
- Service detail deep links remain under `/services/:id`; bare `/services` is the Services surface tab
- Delete: compose — **Danger** rows in scope-chip settings panels (two-press environment delete when multiple exist; `ProjectDeletePanel` for project delete). Managed — header trash can (same two-press / project-wizard behavior). Old `/settings` routes redirect to Overview. Bare compose `/environments` redirects to Overview.

## Creation / setup

1. **Create** (`/projects/new`) — name + workspace → `POST type=empty` (Production once) → `/setup`
2. **Setup** — choose Compose / template / managed (+ catalog); resumable when `metadata.type` is unset
3. Configured stopped projects are complete — do not show as incomplete

## Density

- Tab targets ≥ 44pt; horizontal scroll ok on phone
- Service detail under `/services/:id`

## System / platform projects

- Detection is by `workspace.kind === 'turbopanel'` (and optional `project.metadata.component`) — **never** by display name.
- Platform workspace display name is **TurboPanel Platform**; badge label is **Platform**.
- System projects are **compose-shaped but read-only**: no compose editor, no lifecycle Start/Stop/Destroy, no delete, no workspace move, no Networking/Storage chips.
- Overview shows a platform panel (component key, target server, container status + name) plus optional read-only YAML; Restart when `system:operate` permits.
- Platform badge label is **Platform** (SVG shield/gear + text — never emoji); paired with existing type badge on the TurboPanel Platform workspace project list.
- All-workspaces scope hides platform projects; they appear only when the TurboPanel Platform workspace is explicitly selected.

## Workspace filter

- Overview filter defaults to **All workspaces** (even with a single user workspace); last selection may be restored from localStorage / `?workspaceId=`.
- Menu rows are equal height (no description hints); platform row shows the Platform badge only.
- **All workspaces** is always listed as a filter option.

## Anti-patterns (page-specific)

- ❌ Giant stacked project detail as primary experience  
- ❌ Project-level server placement (environment-owned only)  
- ❌ Showing secret variable values after create  
- ❌ Managed projects exposing Compose UI  
- ❌ Auto-polling deploy preview  
- ❌ Always-on "What will run" / effective-compose panel on the project editor (preview lives in **Preview Deployment** at deploy time only)  
- ❌ Preview Deployment modal on project-level compose scope or for lifecycle Start/Stop of already-deployed containers  
- ❌ Separate shell section tabs above the compose surface for Overview / Compose / Services (those belong *inside* the editor chrome)
- ❌ Diagram / YAML toggle on Overview (diagram = Overview tab; YAML = Compose tab)  
- ❌ Networking / Storage visible while Project (base) compose is selected  
- ❌ Reintroducing section chips (Networking / Storage / Servers) in the editor toolbar  
- ❌ Putting delete back in the project header for compose projects  
- ❌ Showing an environment editor with no inheritance / scope statement above it (banner-less editing)  
- ❌ Stack of empty Settings sections for every resource type (use Add chips inside the gear panel; reveal sections when opened or when data exists)  
- ❌ Treating a user workspace named “System” as platform-managed  
- ❌ Compose editor / lifecycle / delete chrome on system projects  
- ❌ Reintroducing the under-compose settings strip (settings belong on the scope-chip gear)  
- ❌ Defaulting the saved-compose view to raw YAML (Overview is diagram-only; YAML is the Compose tab)
- ❌ Pulling in a DOM-only chart lib (e.g. Mermaid.js) for the compose diagram — must render via `react-native-svg` for Expo/React Native (web + native) parity
