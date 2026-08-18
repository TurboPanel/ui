# Page Override: Servers Overview

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers`.

**Route:** `src/app/[orgId]/servers` → `servers-overview-section.tsx`  
**Job:** Fleet glance — who is online, country, CPU/memory/swap usage, batch update, add server; Detail row or Summary tile opens server detail.

---

## Layout

- One job: **fleet inventory**, not a dashboard of widgets
- Two layouts, toggled from the **title row** (icon-only; persisted in `localStorage` `turbopanel.serversLayout`; default Detail): **Detail** (full-width rows) and **Summary** (compact hairline tiles). Visible chrome is icons only — accessible names are **Detail view** / **Summary view**.
- All actions sit on the **right** of the **Servers** title: **+ Server** / **Update** / select-all (when needed) / view toggle. No intro `pageCopy` blurb.
- **Native (iOS/Android):** title and actions share one row. Detail stacks each host (name, status, country, usage, mesh) so the list **never scrolls sideways**. Summary tiles and native Detail rows sit on the page background — **not** inside the fleet glass. **Update** appears only after hosts are selected.
- Fleet capacity totals (Cores · RAM) and online count live on **Overview**, not here  
- Row / card press navigates to `/[orgId]/servers/[serverId]` (control panel tabs)  
- Toolbar sits **in the title row** — no toolbar hairline / HR separators  
- **+ Server** opens a separate glass `SectionPanel` (Add server) between the title row and the fleet  
- **Web Detail:** fleet hosts sit in their own glass `SectionPanel` (no nested second glass / bordered table card inside it). Table itself has **no outer border/radius box** — header + zebra rows only inside the panel.
- **Summary:** CSS `auto-fill` grid (native: wrapping tiles). Hairline `bgArea` tiles — not glass, not a decorative bento. Select-all lives in the title-row checkbox (not a lone control above the grid).  
- **Datacenters** sub-route (`/servers/datacenters`) for org location inventory (member counts, private CIDRs) — see `pages/datacenters.md`  
- **Pending keys** sub-route (`/servers/keys`) for unused registration keys (not yet bound to a host). Owner-only list + two-press delete. Copy says **keys**, never “license”.  
- **Settings** sub-route (`/servers/settings`) for org default timezone fleet defaults  
- **TLS** sub-route (`/servers/tls`) for the organization certificate library  
- Networking topology: **Datacenters** under Servers (private subnets + members); **Addresses**, **Docker networks**, and TurboFabric under the **Network** area — see `pages/datacenters.md` and `pages/network.md`  
- Page title uses shared `orgPanelStyles.pageTitle`; route context lives in `OrgHeader` eyebrow  
- No hero, no decorative bento above the table
- No inventory KPI strip on this page — org Overview owns Servers / Online / Cores / RAM tiles

## Toolbar

- Icon-only **Detail / Summary** segmented control (`segmentGroup` / `segmentChip`, no visible labels) plus **+ Server** (own-gated) + batch **Update (N)** — all **right-aligned** on the title row  
- **+ Server** toggles a dedicated Add server glass panel between the title row and the fleet; open state shows **Close**  
- Selection hint: `{N} selected · {M} updatable` in monospace when any rows checked (right-aligned under the title row)  
- No horizontal rules under the toolbar
- No “select hosts…” page blurb

## Density

- Detail: compact row height, checkbox column, Host | Status | Country | Usage | Mesh (web table). Native stacks those fields in a full-width row (no horizontal scroll).  
- Summary: OS + name, status + country, vertical usage columns, mesh address, trailing checkbox  
- Web row/tile hover (`bgSecondary`) and selected tint (`bgActive`; cards also accent border)  
- Hostname subtext (monospace) when distinct from display name  
- Alternating row tint (`bgInset`) for scanability on the **web Detail** table  
- OS logo beside name (density-aware PNGs) — no UUID in the primary column  
- Online badge: accent dot + label (country is its own table column on web; stacked under the name on native)  
- Empty fleet: **Add your first server** (point at the toolbar **+ Server** control) — never “Waiting for this server” / colocated-registering copy. An empty list means this org has no hosts (including a new org on a self-hosted instance). The colocated host is a row (Initializing → Online), not an empty-state wait.
- Initializing badge: pending (amber) **pulsing** LED + label when `connected` is false and `statusChangedAt` is null — just-registered hosts (including the colocated host after `/install`) while the daemon is still connecting; not Offline. Fleet list refetches every **2 s** while a listed host is Initializing, then returns to 30 s. Honor reduced motion (static amber).  
- Offline badge: hollow dot + muted label  
- **Country:** flag emoji + English country name from geo (or em dash)  
- **Usage:** four **vertical** columns (`ServerUsageBars`) from one fleet metrics snapshot — **stacked CPU** (user / system / other / iowait, fill grows up), **load** (capacity-scaled `load1 / cpuThreads`; column shows load1, 1/5/15 in the accessibility label), memory + swap % — never per-row metrics polling; values always labeled (not color-only). **List density:** short columns (~22px) so the row stays compact. **Tile density:** taller columns (~64px) that read as a mini chart. **No sample yet:** same four tracks as live usage, empty fills, ellipsis values — never a boxed empty-state card, never `0%` / em-dash bars that read as measured zero  
- Checkbox stops propagation — row press does not toggle selection

## Inventory strip

Fleet capacity tiles moved to **Overview** (`pages/overview.md`). This page keeps per-host usage columns only.

- Load columns still use logical `cpuThreads` from `server.resources`
- Swap stays on per-host usage columns
- Refresh cadence for usage follows fleet usage query (~60 s), not the 30 s servers list

## Add server wizard

- Own glass `SectionPanel` between the toolbar and the fleet table (title **Add server** only — no subtitle/hint) with **3-step indicator** (Name → Install → Connect)  
- Install command in `commandCodeBlock` (monospace, inset panel) + copy button  
- Connect: wait for the host, or **Add another server** (resets to Name without closing the panel). Unused keys remain under **Pending keys**.  
- Success state: accent dot + hostname — no emoji checkmark. **Done** closes; **Add another server** starts a new key.

## Motion

- Row press opacity ~0.88; no expand animation on this page  
- Status dot is geometric — no perpetual pulse on historical/offline rows  
- Initializing uses a short amber LED pulse (core opacity + soft halo) until presence is known  
- Batch update uses shared in-progress poll only — no modal spam

## Components

- Reuse `orgPanelStyles` toolbar buttons + `segmentGroup`, fleet `SectionPanel` (web Detail / empty / error only), `AddServerWizard` (own glass), `ServerUsageBars` (`density: 'list' | 'tile'`)  
- Commands, delete, per-host update detail, time/network, and metrics charts live on the **server detail** page

## Charts

- Not on this page — use the **Metrics** tab on server detail (or legacy `/servers/[id]/metrics` deep link)  
- Fleet usage columns are progress indicators, not gifted-charts (CPU stack segments are proportional fills that grow upward)

## Anti-patterns (page-specific)

- ❌ Calling `fetchServerCell` / DO reads  
- ❌ Per-server status or metrics polling loops (use `GET /servers/metrics/latest` once)  
- ❌ Showing the one-shot install command / registration token after the wizard is dismissed (unused keys stay on **Pending keys** as name + created date only)  
- ❌ Expand rows for commands on the fleet table  
- ❌ Status conveyed by color alone (columns always show a percent, load1, or em dash)  
- ❌ Boxed “Awaiting stats” card or `0%` / em-dash usage bars when a host has no sample yet (use ghost tracks + ellipsis)  
- ❌ Inventing core counts client-side — load bar fill needs daemon-reported `inventory.cpuThreads`  
- ❌ Treating an empty Deno fleet as “waiting for the colocated host” (a new org has no servers; Initializing on a listed row is the colocated wait)
- ❌ Nested glass / bordered table card inside the fleet panel, or rendering Add Server as a second panel below the list
- ❌ Glass wrapping Summary tiles (or native Detail rows), or a lone select-all checkbox sitting in that glass above the tiles
- ❌ Glass / accent-stripe / shadow KPI cards, or a decorative bento of widgets above the fleet table (capacity tiles live on Overview)
- ❌ Horizontal usage tracks (CPU/Load/Mem/Swap are vertical columns)
- ❌ Horizontal scroll on the native fleet list (stack Detail rows to the viewport width)
- ❌ Visible “List / Cards” labels on the view toggle, or an icon-only toggle without an accessible name (Detail view / Summary view)
- ❌ Page-copy blurb under **Servers** (“Select hosts…”); the title row owns the actions
