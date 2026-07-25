# Page Override: Managed Services

> Overrides `design-system/turbopanel/MASTER.md` for managed engine projects and environment provisioning.

**Routes:** `/[orgId]/projects/new` (Managed type + engine catalog), environment detail **Managed connection** panel  
**Job:** Create a managed engine project in a workspace, pin server placement on the environment, then provision Postgres (other engines coming soon).

---

## Current UX

- **Create:** Projects → **New project** → type **Managed** → catalog cards (Postgres available; MySQL/MariaDB/Redis/ClickHouse disabled as coming soon) → workspace + name → `POST /projects` with `type: 'managed'` and engine `code`
- **Provision:** On the project’s environment tab, **Managed connection** panel (after placement, before Deploy) loads `GET /environments/:id/managed` and offers **Provision** when the viewer can manage and a placement server is pinned → `POST /environments/:id/managed/provision`
- Endpoint shows `host:port` when ready, or a pending placeholder while provisioning

## Data model

Uses the existing **`managed`** table:

- Engine projects: one row per **environment** (`environment_id`, unique partial index)
- Engine identity comes from the project catalog code (`postgres`, …)
- Root DB creds: **`principal`** row sealed as `tpsecret`

## Phase 3 roadmap (document only)

- **Org VPC:** WireGuard mesh via daemon cell; at least one server with public IP or port-forward as proxy
- **Read replicas:** log-ship to another server in same DC when possible
- **Move service:** re-home managed row to another org server
- **DB users:** provision principals + assignments from detail UI

## Visual

- Engine catalog cards on project create mirror fleet status pills (Available / Coming soon)
- **Managed connection** uses accent `SectionPanel`; status pills match servers fleet (Running / Failed / Provisioning)
- Action-first — no hero blocks
