# Page Override: Servers Overview

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers`.

**Route:** `src/app/[orgId]/servers` → `servers-overview-section.tsx`  
**Job:** Fleet glance — who is online, OS, batch update, add server, expand for commands.

---

## Layout

- One job: **fleet table**, not a dashboard of widgets  
- Collapsed table is the default; expand reveals Update / Ping / hostname / reboot / Delete  
- Toolbar: title + **+ Server** (own-gated) + batch Update for selected updatable hosts  
- No hero, no stat strip, no decorative bento above the table

## Density

- Table-first: compact row height, checkbox column, Name | Status  
- OS logo beside name (density-aware PNGs) — no UUID in the primary column  
- Online expands to show IP + geo under the badge (hide `__direct__`)

## Motion

- Row expand: 200ms height/opacity  
- Status pulse only while `connected`  
- Command poll feedback inline under buttons (shared 2s coordinator) — no modal spam

## Components

- Reuse `orgPanelStyles`, `colors`, `AddServerWizard` (install command only — no "license" marketing copy)  
- Delete: two-step confirm; surface `server_has_blockers` clearly  

## Charts

- Not on this page — link out to `/servers/[serverId]/metrics`

## Anti-patterns (page-specific)

- ❌ Calling `fetchServerCell` / DO reads  
- ❌ Per-server status polling loops  
- ❌ Showing registration keys after the wizard is dismissed  
