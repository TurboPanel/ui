# Page Override: Project Create

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/projects/new` and `/[projectId]/setup`.

**Routes:** new project (empty) → project setup (type/catalog)  
**Job:** Create an empty project with Production once, then choose how it runs.

---

## Flow

1. **Details** (`/projects/new`) — name, optional description, workspace (existing or create) → `POST /projects` with `type: 'empty'`
2. **Type** (`/projects/:id/setup`) — Docker Compose / Template / Managed
3. **Catalog** — template or managed engine only; Compose configures immediately

Progress: `WizardStepIndicator` (Details on create; Type → Catalog on setup).

## Layout (Details step)

- **Centered single column** — `maxWidth: 440`, vertically centered in the org content area (`flexGrow` + `justifyContent: 'center'`)
- Compact **GlassSurface** panel (not a full-bleed `SectionPanel`); short centered page title + one-line subtitle above the panel
- Density closer to auth create flows than dense fleet tables — keep fields tight, avoid long panel hints
- Description is always visible as a **2-line multiline** field (`minHeight` ~72) so longer copy is obvious
- Single user workspace → quiet summary row (no tall picker list); multiple → compact scrollable list (`maxHeight` ~160)
- Workspace segment chips stretch full panel width
- Cancel text link under the panel → back to projects

## Details step fields

- **Name** (required) — unique within the organization (trim + case-insensitive; enforced by API)
- **Description** (optional) — always-visible 2-row multiline input
- **Workspace** — segment: Existing | Create new
  - Existing: picker of visible workspaces (preselected from `?workspaceId=` / active scope / sole workspace)
  - Create new: single **Workspace name** field — mirrors the project name as they type until edited; clearing the field resumes mirroring; creates the workspace first, then the project

## UX rules

- Production is created with the empty project — never ask the operator to create it
- Interrupted setup is resumable (open project → setup until type is set)
- Projects remain undeployed during setup
- Touch targets ≥ 44pt; one column on phone
- Surface `project_name_in_use` / `workspace_name_in_use` as plain-language field/API errors

## Anti-patterns

- ❌ Choosing type before the project exists  
- ❌ Requiring a second Production create  
- ❌ Full-bleed / max-width content form on desktop  
- ❌ Long explanatory paragraphs in the create header  
- ❌ Single-line description that hides multi-line intent  
- ❌ Same as project / Custom workspace-name segment  
- ❌ Separate draft/runtime status field  
