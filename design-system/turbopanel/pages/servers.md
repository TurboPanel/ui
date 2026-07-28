# Page Override: Servers Overview

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers`.

**Route:** `src/app/[orgId]/servers` → `servers-overview-section.tsx`  
**Job:** Fleet glance — who is online, OS, batch update, add server; row opens server detail.

---

## Layout

- One job: **fleet table**, not a dashboard of widgets  
- Row press navigates to `/[orgId]/servers/[serverId]` (control panel tabs)  
- Toolbar inside `SectionPanel` (no title/hint bar): **+ Server** (own-gated) + batch Update for selected updatable hosts  
- **Settings** sub-route (`/servers/settings`) for org default timezone fleet defaults  
- Page title uses shared `orgPanelStyles.pageTitle` / `pageCopy`; route context lives in `OrgHeader` eyebrow  
- No hero, no stat strip, no decorative bento above the table

## Toolbar

- **+ Server** (own-gated) + batch **Update (N)** for selected updatable hosts  
- Selection hint: `{N} selected · {M} updatable` in monospace when any rows checked

## Density

- Table-first: compact row height, checkbox column, Host | Status  
- Web row hover (`bgSecondary`) and selected tint (`bgActive`)  
- Hostname subtext (monospace) when distinct from display name  
- Alternating row tint (`bgInset`) for scanability  
- OS logo beside name (density-aware PNGs) — no UUID in the primary column  
- Online badge: accent dot + label + optional flag (no expand disclosure on this page)  
- Offline badge: hollow dot + muted label  
- Checkbox stops propagation — row press does not toggle selection

## Add server wizard

- Accent `SectionPanel` with **3-step indicator** (Name → Install → Connect)  
- Install command in `commandCodeBlock` (monospace, inset panel) + copy button  
- Success state: accent dot + hostname — no emoji checkmark

## Motion

- Row press opacity ~0.88; no expand animation on this page  
- Status dot is geometric — no perpetual pulse on historical/offline rows  
- Batch update uses shared in-progress poll only — no modal spam

## Components

- Reuse `orgPanelStyles` toolbar buttons, `SectionPanel`, `AddServerWizard`  
- Commands, delete, per-host update detail, time/network, and metrics live on the **server detail** page

## Charts

- Not on this page — use the **Metrics** tab on server detail (or legacy `/servers/[id]/metrics` deep link)

## Anti-patterns (page-specific)

- ❌ Calling `fetchServerCell` / DO reads  
- ❌ Per-server status polling loops  
- ❌ Showing registration keys after the wizard is dismissed  
- ❌ Expand rows for commands on the fleet table
