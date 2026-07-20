# Page Override: Projects

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/projects` and project detail.

**Routes:** projects overview, create, `[projectId]` (+ embedded environments)  
**Job:** Organize work by workspace; edit compose; place environments on servers; deploy.

---

## Layout

- Overview: workspace switcher + project list (workspace label when viewing all)  
- Detail: base compose editor → environments section below (not a separate top-level area)  
- Single environment: hide tab bar; show name in toolbar  
- Deploy disabled until a **connected** server is pinned on the environment

## Density

- Compose editor is the heavy surface — give it vertical room  
- Lint panel compact under editor (errors red, warnings yellow)  
- Container status badges inline in environment Containers panel

## Motion

- Environment tab switch remounts body (`key={environmentId}`) — keep transition light  
- Deploy/stop: poll command status; show terminal states inline

## Components

- Compose: Editor | Visual tabs; placement only on environment overlays  
- Delete project: stop-running-services wizard then type-name confirm  

## Anti-patterns (page-specific)

- ❌ Project-level server placement (environment-owned only)  
- ❌ Showing secret variable values after create  
- ❌ Card grids of empty "feature" tiles on the overview  
