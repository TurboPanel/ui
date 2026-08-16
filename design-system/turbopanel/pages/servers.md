# Page Override: Servers Overview

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers`.

**Route:** `src/app/[orgId]/servers` → `servers-overview-section.tsx`  
**Job:** Fleet glance — inventory totals, who is online, country, CPU/memory/swap usage, batch update, add server; row opens server detail.

---

## Layout

- One job: **fleet table**, not a dashboard of widgets  
- Lean **inventory strip** above the table (count · cores · RAM · swap · avg CPU · avg memory) — monospace values, no cards  
- Row press navigates to `/[orgId]/servers/[serverId]` (control panel tabs)  
- Toolbar inside `SectionPanel` (no title/hint bar): **+ Server** (own-gated) + batch Update for selected updatable hosts  
- **Datacenters** sub-route (`/servers/datacenters`) for org location inventory (member counts, private CIDRs) — see `pages/datacenters.md`  
- **Settings** sub-route (`/servers/settings`) for org default timezone fleet defaults  
- **TLS** sub-route (`/servers/tls`) for the organization certificate library  
- Networking topology: **Datacenters** under Servers (private CIDR + members); **Addresses**, **Docker networks**, and TurboFabric under the **Network** area — see `pages/datacenters.md` and `pages/network.md`  
- Page title uses shared `orgPanelStyles.pageTitle` / `pageCopy`; route context lives in `OrgHeader` eyebrow  
- No hero, no decorative bento above the table

## Toolbar

- **+ Server** (own-gated) + batch **Update (N)** for selected updatable hosts  
- Selection hint: `{N} selected · {M} updatable` in monospace when any rows checked

## Density

- Table-first: compact row height, checkbox column, Host | Status | Country | Usage | Mesh  
- Web row hover (`bgSecondary`) and selected tint (`bgActive`)  
- Hostname subtext (monospace) when distinct from display name  
- Alternating row tint (`bgInset`) for scanability  
- OS logo beside name (density-aware PNGs) — no UUID in the primary column  
- Online badge: accent dot + label (country lives in its own column)  
- Initializing badge: pending (amber) **pulsing** LED + label when `connected` is false and `statusChangedAt` is null — just-registered hosts (including the colocated “this server” after `/install`) while the daemon is still connecting; not Offline. Fleet list refetches every **2 s** until Initializing clears, then returns to 30 s. Honor reduced motion (static amber).  
- Offline badge: hollow dot + muted label  
- **Country:** flag emoji + English country name from geo (or em dash)  
- **Usage:** compact pro bars (`ServerUsageBars`) from one fleet metrics snapshot — **stacked CPU** (user / system / other / iowait), **load 1/5/15** numbers with capacity-scaled bar (`load1 / cpuThreads`), memory + swap % — never per-row metrics polling; values always labeled (not color-only). **No sample yet:** same four tracks as live usage, empty fills, ellipsis values — never a boxed empty-state card, never `0%` / em-dash bars that read as measured zero  
- Checkbox stops propagation — row press does not toggle selection

## Inventory strip

- Shows as soon as the fleet list is known (including zero)  
- **Capacity:** total cores (`inventory.cpuCores`) + total RAM + total swap from `server.inventory` (daemon hello); RAM falls back to metrics `memoryUsed + memoryAvailable` when inventory is absent. Load bars use logical `cpuThreads`.  
- Avg CPU / avg memory average only servers with a recent usage sample; otherwise `—`  
- Refresh cadence follows fleet usage query (~60 s), not the 30 s servers list

## Add server wizard

- Accent `SectionPanel` with **3-step indicator** (Name → Install → Connect)  
- Install command in `commandCodeBlock` (monospace, inset panel) + copy button  
- Success state: accent dot + hostname — no emoji checkmark

## Motion

- Row press opacity ~0.88; no expand animation on this page  
- Status dot is geometric — no perpetual pulse on historical/offline rows  
- Initializing uses a short amber LED pulse (core opacity + soft halo) until presence is known  
- Batch update uses shared in-progress poll only — no modal spam

## Components

- Reuse `orgPanelStyles` toolbar buttons, `SectionPanel`, `AddServerWizard`, `ServerUsageBars`  
- Commands, delete, per-host update detail, time/network, and metrics charts live on the **server detail** page

## Charts

- Not on this page — use the **Metrics** tab on server detail (or legacy `/servers/[id]/metrics` deep link)  
- Fleet usage bars are progress indicators, not charts (CPU stack segments are proportional fills)

## Anti-patterns (page-specific)

- ❌ Calling `fetchServerCell` / DO reads  
- ❌ Per-server status or metrics polling loops (use `GET /servers/metrics/latest` once)  
- ❌ Showing registration keys after the wizard is dismissed  
- ❌ Expand rows for commands on the fleet table  
- ❌ Status conveyed by color alone (bars always show a percent, load triplet, or em dash)  
- ❌ Boxed “Awaiting stats” card or `0%` / em-dash usage bars when a host has no sample yet (use ghost tracks + ellipsis)  
- ❌ Inventing core counts client-side — load bar fill needs daemon-reported `inventory.cpuThreads`
