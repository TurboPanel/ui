# Page Override: Project Create

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/projects/new` and `/[projectId]/setup`.

**Routes:** new project (empty) → project setup (type/catalog)  
**Job:** Create an empty project with Production once, then choose how it runs.

---

## Flow

1. **Details** (`/projects/new`) — workspace + name → `POST /projects` with `type: 'empty'`
2. **Type** (`/projects/:id/setup`) — Docker Compose / Template / Managed
3. **Catalog** — template or managed engine only; Compose configures immediately

Progress: `WizardStepIndicator` (Details on create; Type → Catalog on setup).

## UX rules

- Production is created with the empty project — never ask the operator to create it
- Interrupted setup is resumable (open project → setup until type is set)
- Projects remain undeployed during setup
- Touch targets ≥ 44pt; one column on phone

## Anti-patterns

- ❌ Choosing type before the project exists  
- ❌ Requiring a second Production create  
- ❌ Long explanatory paragraphs in the compose header  
- ❌ Separate draft/runtime status field  
