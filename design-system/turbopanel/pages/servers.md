# Page Override: Servers Overview

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers`.

**Route:** `src/app/[orgId]/servers` → `servers-overview-section.tsx`  
**Job:** Fleet glance — inventory totals, who is online, country, CPU/memory/swap usage, batch update, add server; row opens server detail.

---

## Layout

- One job: **fleet table**, not a dashboard of widgets  
- Full-width **inventory stat boxes** above the toolbar (Cores · RAM) — equal-width hairline tiles, uppercase labels, monospace values; wrap on narrow viewports. Not a decorative bento / widget dashboard.  
- Row press navigates to `/[orgId]/servers/[serverId]` (control panel tabs)  
- Toolbar (**+ Server** / **Update**) sits **above** the glass — no toolbar hairline / HR separators  
- **+ Server** opens a separate glass `SectionPanel` (Add server) between the toolbar and the fleet table glass  
- Fleet hosts sit in their own glass `SectionPanel` (no nested second glass / bordered table card inside it)  
- Table itself has **no outer border/radius box** — header + zebra rows only inside the panel  
- **Datacenters** sub-route (`/servers/datacenters`) for org location inventory (member counts, private CIDRs) — see `pages/datacenters.md`  
- **Settings** sub-route (`/servers/settings`) for org default timezone fleet defaults  
- **TLS** sub-route (`/servers/tls`) for the organization certificate library  
- Networking topology: **Datacenters** under Servers (private CIDR + members); **Addresses**, **Docker networks**, and TurboFabric under the **Network** area — see `pages/datacenters.md` and `pages/network.md`  
- Page title uses shared `orgPanelStyles.pageTitle` / `pageCopy`; route context lives in `OrgHeader` eyebrow  
- No hero, no decorative bento above the table

## Toolbar

- **+ Server** (own-gated) + batch **Update (N)** for selected updatable hosts — right-aligned, above the glass panels  
- **+ Server** toggles a dedicated Add server glass panel between the toolbar and the fleet glass; open state shows **Close**  
- Selection hint: `{N} selected · {M} updatable` in monospace when any rows checked (right-aligned under the actions)  
- No horizontal rules under the toolbar

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
- One equal-width row of compact boxes spanning the content width (web: `repeat(auto-fit, minmax(128px, 1fr))`; native: `flex: 1` + wrap)  
- Hairline border (`borderSubtle`) + `bgArea` fill + 8px radius — no glass, no accent stripe, no shadows  
- Label above value (11px uppercase muted / 16px mono)  
- **Capacity:** total cores (`inventory.cpuCores`) + total RAM from `server.inventory` (daemon hello); RAM falls back to metrics `memoryUsed + memoryAvailable` when inventory is absent. Load bars use logical `cpuThreads`. Swap stays on per-row usage bars, not the inventory strip.  
- Refresh cadence follows fleet usage query (~60 s), not the 30 s servers list

## Add server wizard

- Own glass `SectionPanel` between the toolbar and the fleet table (title + hint + accent stripe) with **3-step indicator** (Name → Install → Connect)  
- Install command in `commandCodeBlock` (monospace, inset panel) + copy button  
- Success state: accent dot + hostname — no emoji checkmark

## Motion

- Row press opacity ~0.88; no expand animation on this page  
- Status dot is geometric — no perpetual pulse on historical/offline rows  
- Initializing uses a short amber LED pulse (core opacity + soft halo) until presence is known  
- Batch update uses shared in-progress poll only — no modal spam

## Components

- Reuse `orgPanelStyles` toolbar buttons, fleet `SectionPanel`, `AddServerWizard` (own glass), `ServerUsageBars`  
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
- ❌ Nested glass / bordered table card inside the fleet panel, or rendering Add Server as a second panel below the list
- ❌ Glass / accent-stripe / shadow KPI cards, or a decorative bento of widgets above the fleet table (inventory boxes stay hairline tiles)
