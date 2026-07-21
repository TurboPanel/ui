# Page Override: Managed Services

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers/managed`.

**Routes:** managed overview, `/managed/new`, `/managed/[id]` detail  
**Job:** Provision Postgres on a connected server; list and inspect services.

---

## Current UX

- **Provisioned** panel lists rows from `GET /managed-services` (engine, server, status)
- **Engines** catalog: Postgres available; MySQL/MariaDB/Redis/ClickHouse coming soon
- Provision wizard: connected-server picker + display name → `POST /managed-services`
- Detail: connection endpoint (stub host/port until daemon install), move/replica buttons disabled

## Data model

Uses existing **`managed`** table — not a separate table:

- Catalog managed **apps**: `project_id` (unique partial index)
- Standalone **services**: `server_id` + `display_name` + `metadata.engine/status/...`
- Root DB creds: **`principal`** row sealed as `tpsecret`

## Phase 3 roadmap (document only)

- **Org VPC:** WireGuard mesh via daemon cell; at least one server with public IP or port-forward as proxy
- **Read replicas:** log-ship to another server in same DC when possible
- **Move service:** re-home managed row to another org server
- **DB users:** provision principals + assignments from detail UI

## Visual

- Accent `SectionPanel` for provisioned list
- Status pills match servers fleet (Running / Failed / Provisioning)
- Action-first — no hero blocks
