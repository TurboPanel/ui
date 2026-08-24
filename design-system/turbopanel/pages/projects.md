# Page Override: Projects

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/projects` and project detail.

**Routes:** projects overview, create, `[projectId]/*` tabbed shell  
**Job:** Organize work by workspace; configure type; edit compose / managed panels via tabs; place environments on servers; deploy.

---

## Layout

- Overview: compact workspace **filter** under the page title (defaults to **All workspaces**; expands to equal-height list) + project list (workspace label when viewing all); **setup** badge when type is unset
- Detail: **Project shell** — breadcrumb title **Projects ›** type glyph (`ProjectTitleIcon`) + project name + compose **Project · environments** scope chips (`ProjectScopeSelector` in the project header). Managed projects keep a header trash for delete; compose projects have **no** header trash — all compose delete (project and environment) lives on the **Settings** surface tab (`ProjectSettingsPanel` / `EnvironmentSettingsPanel` → Danger). Section nav, tab body
- **The compose file is the surface — there is no section nav.** Overview / Compose / Services are three representations of one artifact; Hosting and Storage are properties of a *service*; Servers and Settings are properties of a *scope*. Flattening those into a nav list (rail or tab strip) is the competitor layout and it is banned here: it makes the operator leave the service they are looking at to configure it somewhere else.
- **Lens bar**: a three-item segmented control — **Overview · Compose · Services** — in the surface header. Three items forever, however large the project. A configuration route keeps Services lit.
- **Services lens**: one row per compose service — status dot, name, `image` / build source, and a right gutter of live facts (published ports, hostname, releases). Pressing the row expands that service's compose fields inline, pressing a fact expands that fact's editor inline, narrowed to the one service. Deliberately **not** a rendering of the file: no YAML lines, no `+ N more keys` count, no `volumes:` / `networks:` blocks — the verbatim text is one lens away in Compose, and a list that repeats the file is a worse editor than the real one.
- **Scope strip**: first row of the Services lens — where this scope deploys, the service count, and a gear for scope configuration (Servers / Storage / Settings). Create-wizard drafts get all three lenses. Scope chips stay Project · environments and carry **no gear**; switching Project ↔ environment keeps the active lens. **Hosting** edits hostnames / ports / TLS (`EnvironmentDetailBody` `sections={['hosting']}`): Project scope stacks every environment (heading when more than one); environment scope edits that env only. **Servers** holds placement: Project scope is the default project server plus a pin panel per environment (title = env name); environment scope is that env’s pin (clear inherits the project default). **Storage** is persistent volumes for the scope — storage belongs to an environment, so Project scope stacks one panel per environment and environment scope edits that env only; add creates identity + primary location + optional mount (`pages/storage.md`). **Settings** renders inline in the surface (no modal, no dropdown): Project scope has quiet **Add Variable / Add System user** chips plus Workspace, the **Keep original container names** toggle (default Off = rename; On warns that rolling updates are disabled), and Danger → Delete project; environment scope has an **Add Variable** chip for environment overrides plus Danger → Delete environment. Sections reveal when opened or when data already exists. `?hostingId=` opens the **Hosting** tab (keeps the query so the matching row can focus).
- **Scope selector**: **Project** first, always visible, never folded into a menu. Environments to its right — a chip while there is one, a **searchable picker** past that (`ProjectScopePicker`: anchored menu on desktop, sheet on compact, filter field at `PROJECT_SCOPE_SEARCH_MIN` = 8). The picker trigger always names an environment: the active one, or the first one **unhighlighted** while Project is selected, so the strip never reads as "Project and… nothing". Platform projects place one environment per server, so the list grows with the fleet; never answer that by scrolling a wider chip strip. Status dot on chips and rows alike.
- **Environment labels**: platform projects name every environment after the component, so `environmentDisplayName(…, { preferServer: true })` shows the **placed server** instead — a column of identical `HTTP/HTTPS Ingress` chips tells the operator nothing. Server labels everywhere come from `serverDisplayName` (name → hostname → short id); never render a bare server UUID.
- **Inheriting environment**: `InlineNotice` (**Inheriting project compose** + Create override / Start from project compose) above the project compose rendered plainly and readably in a `Project compose · read only` block. Never a card over a dimmed backdrop — the point of the screen is reading what deploys today.
- Scope banner: `ComposeScopeBanner` (`src/components/org/project/compose-scope-banner.tsx`) only when an environment has compose overrides (**Clear overrides**, two-press). Inheriting environments have no banner — the **Compose** tab starts a blank overlay
- **Preview Deployment** (`PreviewDeploymentModal`): lifecycle **Preview ▾** (inspect: Merged compose / Prepared compose) and **Deploy / Redeploy / Cacheless redeploy** (confirm enqueue). Modal titles **Compose Preview** vs **Confirm Deployment**. **Merged** keeps service-level `x-turbopanel` metadata and annotates the live environment pin (`x-turbopanel.placement`) for review. **Prepared** is the server deploy-preview (no auto-poll); a single-server pin shows one runtime `compose.yaml`, not a duplicate per-server copy. Not shown for project-level compose or Start/Stop.
- **Overview** (`/overview` or `/environments/:id`): opens on **Project** by default. Inventory strip + topology **diagram only** (no Diagram/YAML toggle; no Edit button). YAML is the Compose tab.
  - **Inventory tiles** (`ComposeInventoryStrip` → shared `StatTiles`) — icon-led count tiles in an auto-fit grid across the top of the Overview body, counting resources at the active scope: Project scope shows environments / servers (distinct, across environments) / services / networks / volumes / storage; Environment scope shows server (0/1) / services / networks / volumes / storage / bindings, all scoped to that environment (no N+1 fetches). Glyph per resource from `icons/resource-icons.tsx` (+ the compose nav glyphs); a zero count dims its tile rather than disappearing, so the set of resource types stays legible. Not the wider bordered `StatusStatBoxes` — those are page-level fleet numbers.
  - **Diagram** (`ComposeGraphView`, `src/lib/compose/graph.ts`) — Overview body: cross-platform `react-native-svg` node graph (services as cards with a status dot when deployed, networks as pill "bus" connectors, volumes as dashed resource tags), laid out top-to-bottom by `depends_on`, with accessibility text fallback (`describeComposeGraph`) and a **key** rendered as one quiet hairline pill below the canvas, right-aligned (diagram chrome, not a second content block — node shapes already carry their own kind label). The diagram centres in its surface rather than pinning left. Empty when there are no nodes; blank compose shows “No compose defined yet.”
- **Compose** tab (`/compose`, `/environments/:id/compose`): YAML editor + **Discard** / **Save** inside the same surface (tabs remain in the chrome header). Both actions appear only while unsaved; Discard is two-press (`Discard` → `Discard?`) so the 40px header does not grow a confirm row.
- **Services** tab (`/services`, `/environments/:id/services`): visual service forms + the same **Discard** / **Save**.
- **Hosting** tab (`/hosting`, `/environments/:id/hosting`): hostnames / ports / TLS for the active scope.
- **Servers** tab (`/servers`, `/environments/:id/servers`): project default server and/or environment pin (not a settings-gear dropdown).
- Lifecycle **Preview ▾ / Deploy / Redeploy ▾ / Start / Stop / Refresh / Destroy** sits below when an environment is selected. After start, service status rows appear on Overview with green / yellow / red dots (mirrored on diagram service nodes).
- Managed tabs: Overview · Connect · Data · Backups · Environments (shell strip — managed only)
- Single environment: shell shows name (no chip strip) on managed non-Overview tabs; multi-env: chip selector on those tabs keeps selection in memory (compose scope uses path `/environments/:id`)
- Service detail deep links remain under `/services/:id`; bare `/services` is the Services surface tab
- Delete: compose — **Danger** rows in scope-chip settings panels (two-press environment delete when multiple exist; `ProjectDeletePanel` for project delete). Managed — header trash can. Project delete **destroys** each remaining `managed` cluster (`DELETE …/managed` → `managed.destroy`) and waits for the command before `DELETE /projects/:id`. Environment trash on a multi-env managed project does the same before `DELETE /environments/:id`. Never call tenant `environment.stop` for a managed cluster.

## Creation / setup

1. **Create** (`/projects/new`) — name + workspace → `POST type=empty` (Production once) → `/setup`
2. **Setup** — choose Compose / template / managed (+ catalog); resumable when `metadata.type` is unset
3. Configured stopped projects are complete — do not show as incomplete

## Density

- Tab targets ≥ 44pt; horizontal scroll ok on phone
- Service detail under `/services/:id`

## System / platform projects

- Detection is by `workspace.kind === 'turbopanel'` (and optional `project.metadata.component`) — **never** by display name. `project.metadata.type === 'system'` is a **display classifier only** — glyph/badge/label selection — and must never be used as the read-only or authorization gate.
- Platform workspace display name is **TurboPanel**; badge label is **Platform**. Type badge text comes from `projectTypeLabel` → `TURBOPANEL_WORKSPACE_BADGE_LABEL`, not a new literal.
- `ProjectTitleIcon` (`src/components/org/project/project-title-icon.tsx`) renders `PlatformShieldIcon` from `src/components/org/platform-badge.tsx` for `system`-typed projects instead of the compose cube, with accessible label **Platform project**; colors from `chrome.*` in `src/lib/theme.ts` — no one-off hex, no emoji.
- System projects are **compose-shaped but read-only**: no compose editor, no lifecycle Start/Stop/Destroy, no delete, no workspace move, no Hosting/Servers tabs or Storage chips.
- Overview shows a platform panel (component key, target server, container status + name) plus optional read-only YAML; Restart when `system:operate` permits. Platform panel copy is HTTP/HTTPS Ingress · Database Ingress · Database High-Availability · Self Hosted TurboPanel Instance via `systemComponentLabel()`.
- Platform badge label is **Platform** (SVG shield/gear + text — never emoji); paired with existing type badge on the TurboPanel workspace project list.
- All-workspaces scope hides platform projects; they appear only when the TurboPanel workspace is explicitly selected.

## Workspace filter

- Overview filter defaults to **All workspaces** (even with a single user workspace); last selection may be restored from localStorage / `?workspaceId=`.
- Menu rows are equal height (no description hints); platform row shows the Platform badge only.
- **All workspaces** is always listed as a filter option.

## Anti-patterns (page-specific)

- ❌ Giant stacked project detail as primary experience  
- ❌ Storing placement in compose YAML (`x-turbopanel.placement`) — pins live on the Servers tab (project default + environment override)
- ❌ Showing secret variable values after create  
- ❌ Managed projects exposing Compose UI  
- ❌ Auto-polling deploy preview  
- ❌ Always-on "What will run" / effective-compose panel on the project editor (preview lives in **Preview Deployment** at deploy time only)  
- ❌ Preview Deployment modal on project-level compose scope or for lifecycle Start/Stop of already-deployed containers  
- ❌ Separate shell section tabs above the compose surface for Overview / Compose / Services / Hosting / Servers (those belong *inside* the editor chrome)
- ❌ Diagram / YAML toggle on Overview (diagram = Overview tab; YAML = Compose tab)  
- ❌ **A section nav for the project editor — rail *or* tab strip.** Seven destinations in a list is the competitor layout; configuration belongs on the object it configures  
- ❌ A settings gear on the scope chips (chips are a pure Project ↔ environment switch)  
- ❌ A fourth lens (the bar is Overview · Compose · Services; anything else is configuration reached from a service row)  
- ❌ Rebuilding the compose file inside the Services lens — YAML lines, `volumes:` / `networks:` blocks, key counts (that is the Compose lens)  
- ❌ Sending the operator to a page listing every service to edit the one they were already looking at  
- ❌ Showing Hosting / Servers on the create-wizard draft (no environments yet)
- ❌ Putting delete back in the project header for compose projects  
- ❌ A modal / scrim over the inherited compose (it hides the thing being explained)  
- ❌ A horizontal chip strip for a scope list that grows with the fleet  
- ❌ Repeating the component name on every platform environment instead of the server  
- ❌ A plain `value · label` text run for the Overview counts (they are icon tiles)  
- ❌ Showing an environment editor with no inheritance / scope statement above it (banner-less editing)  
- ❌ Stack of empty Settings sections for every resource type (use Add chips inside the gear panel; reveal sections when opened or when data exists)  
- ❌ Treating a user workspace named “System” as platform-managed  
- ❌ Gating read-only chrome on `metadata.type` instead of `workspace.kind`
- ❌ Inventing a parallel platform badge/glyph or label literal instead of reusing `PlatformShieldIcon` / `TURBOPANEL_WORKSPACE_BADGE_LABEL` / `systemComponentLabel()`
- ❌ Compose editor / lifecycle / delete chrome on system projects  
- ❌ Reintroducing the under-compose settings strip (settings belong on the Settings surface tab)  
- ❌ Defaulting the saved-compose view to raw YAML (Overview is diagram-only; YAML is the Compose tab)
- ❌ Pulling in a DOM-only chart lib (e.g. Mermaid.js) for the compose diagram — must render via `react-native-svg` for Expo/React Native (web + native) parity
