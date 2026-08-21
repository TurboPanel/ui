# Page Override: Project Create

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/projects/new` and `/[projectId]/setup`.

**Routes:** new project wizard (`/projects/new`); resumable setup (`/[projectId]/setup`) for untyped projects  
**Job:** Name the project, pick how it runs, then create it in one submit.

---

## Flow

1. **Details** (`/projects/new`) — name, optional description, workspace (existing or create). Nothing is written yet.
2. **Type** — **Compose** / **Template** / **Managed** (not “Docker Compose”, “From Template”, or “Managed Service”)
3. **Catalog or compose draft** — template or managed engine pick, or a compose YAML draft; **Create project** writes the project with its final type

Progress: wizard steps inside one screen — no numbered step chips. Back walks the wizard; a **Cancel** text link under the panel always returns to projects.

## Type cards

Leading outline SVG (never emoji) beside each label, accent when selected:

| Type | Label | Icon | Copy |
|------|-------|------|------|
| `docker-compose` | Compose | Feather / quill | A blank slate for multiple services. |
| `template` | Template | Page layout blocks | Start from a catalog template with sensible defaults already wired up. |
| `managed` | Managed | Database cylinder | A service that is automatically set up for you. Provisioning, pooling, backups, and connections are handled. |

Do not name engines on the Managed card or advertise Redis / ClickHouse as coming.

## Layout (Details step)

- **Centered single column** — `maxWidth: 440`, vertically centered in the org content area (`flexGrow` + `justifyContent: 'center'`)
- Compact **GlassSurface** panel (not a full-bleed `SectionPanel`); short centered page title + one-line subtitle above the panel
- Density closer to auth create flows than dense fleet tables — keep fields tight, avoid long panel hints
- Description is always visible as a **2-line multiline** field (`minHeight` ~72) so longer copy is obvious
- Single user workspace → quiet summary row (no tall picker list); multiple → compact scrollable list (`maxHeight` ~160)
- Workspace segment chips stretch full panel width
- **Cancel** text link under the panel → back to projects (keep it; do not replace it with a second Cancel button)

## Details step fields

- **Name** (required) — unique within the organization (trim + case-insensitive; enforced by API)
- **Description** (optional) — always-visible 2-row multiline input
- **Workspace** — segment: Existing | Create new
  - Existing: picker of visible workspaces (preselected from `?workspaceId=` / active scope / sole workspace)
  - Create new: single **Workspace name** field — mirrors the project name as they type until edited; clearing the field resumes mirroring; creates the workspace first, then the project

## UX rules

- The default environment is created with the project on the final Create — never ask the operator to create it
- Interrupted setup is resumable (open an untyped project → setup until type is set)
- Projects remain undeployed during setup
- Touch targets ≥ 44pt; one column on phone
- Surface `project_name_in_use` / `workspace_name_in_use` as plain-language field/API errors

## Anti-patterns

- ❌ Writing the project before the type is chosen (except resumable setup for already-empty projects)
- ❌ Requiring a second Production create
- ❌ Full-bleed / max-width content form on desktop
- ❌ Long explanatory paragraphs in the create header
- ❌ Single-line description that hides multi-line intent
- ❌ Numbered wizard step chips (1 / 2) on create or setup
- ❌ Separate draft/runtime status field
- ❌ Naming Redis / ClickHouse as coming on the Managed type card
