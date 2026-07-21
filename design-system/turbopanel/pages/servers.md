# Page Override: Servers Overview

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers`.

**Route:** `src/app/[orgId]/servers` → `servers-overview-section.tsx`  
**Job:** Fleet glance — who is online, OS, batch update, add server, expand for commands.

---

## Layout

- One job: **fleet table**, not a dashboard of widgets  
- Collapsed table is the default; expand reveals version / commands / metrics link / delete  
- Toolbar inside accent `SectionPanel` ("Fleet"): **+ Server** (own-gated) + batch Update for selected updatable hosts  
- Page title uses shared `orgPanelStyles.pageTitle` / `pageCopy`; route context lives in `OrgHeader` eyebrow  
- No hero, no stat strip, no decorative bento above the table

## Toolbar

- **+ Server** (own-gated) + batch **Update (N)** for selected updatable hosts  
- Selection hint: `{N} selected · {M} updatable` in monospace when any rows checked  
- Fleet hint shows live host count

## Density

- Table-first: compact row height, checkbox column, Host | Status  
- Web row hover (`bgSecondary`) and selected tint (`bgActive`)  
- Hostname subtext (monospace) when distinct from display name  
- Alternating row tint (`bgInset`) for scanability  
- OS logo beside name (density-aware PNGs) — no UUID in the primary column  
- Online badge: accent dot + label + optional flag; tap expands IP + geo under the badge (hide `__direct__`)  
- Offline badge: hollow dot + muted label

## Expand row

- Left accent stripe on expanded panel (`accent` 2px)  
- Subsections in `orgPanelStyles.expandedSection` cards: OS, daemon version, commands  
- Commands panel uses uppercase `detailTitle`; latency breakdown in `detailCard`  
- Reboot uses danger-styled button (error border/text)  
- **View metrics** as accent primary action in footer row (links to `/servers/[serverId]/metrics`)

## Add server wizard

- Accent `SectionPanel` with **3-step indicator** (Name → Install → Connect)  
- Install command in `commandCodeBlock` (monospace, inset panel) + copy button  
- Success state: accent dot + hostname — no emoji checkmark

## Motion

- Row expand: instant (content swap); press opacity ~0.88 on toolbar/nav  
- Status dot is geometric — no perpetual pulse on historical/offline rows  
- Command poll feedback inline under buttons (shared 2s coordinator) — no modal spam

## Components

- Reuse `orgPanelStyles` toolbar buttons, `SectionPanel` accent stripe, `AddServerWizard`  
- Delete: two-step confirm; surface `server_has_blockers` clearly  

## Charts

- Not on this page — **View metrics** links out to `/servers/[serverId]/metrics`

## Anti-patterns (page-specific)

- ❌ Calling `fetchServerCell` / DO reads  
- ❌ Per-server status polling loops  
- ❌ Showing registration keys after the wizard is dismissed  
