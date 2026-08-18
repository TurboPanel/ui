# Page Override: Organization Overview

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/overview`.

**Route:** `src/app/[orgId]/overview` → `overview-section.tsx`  
**Job:** Org glance — fleet status tiles (servers / cores / RAM). Organization name and identity live on **Manage Organization**.

---

## Layout

- Page title **Overview**, then a full-width **status strip**
- Status strip: equal-width hairline tiles (Servers · Cores · RAM) — uppercase labels, monospace values; wrap on narrow viewports
- Same tile treatment as the former Servers inventory boxes — **not** glass, accent stripe, shadows, or a decorative bento
- No organization form, hero, charts, or second widget dashboard

## Status strip

- Shows as soon as the fleet list is known (including zero hosts)
- **Servers** = green online count (`resolveServerConnectionStatus === 'online'`) with muted suffix `N offline` / `N initializing` when those statuses exist (Initializing is never labeled Offline)
- **Cores** from `server.resources.cpus[].cores.total` (thread fallback; leftover `resources.cpu.coreCount` still accepted); **RAM** from `server.resources.memory.totalBytes`, else metrics `memoryUsed + memoryAvailable`
- Values always labeled (not color-only). Unknown capacity is an em dash, not `0`
- Refresh: servers list 30 s (2 s while any host is Initializing); fleet usage ~60 s. Pull-to-refresh refetches fleet
- One `GET /servers` + one `GET /servers/metrics/latest` — never per-server DO/metrics polls

## Anti-patterns (page-specific)

- ❌ Glass / accent-stripe / shadow KPI cards
- ❌ Decorative bento of widgets
- ❌ Status conveyed by color alone (green online count is paired with offline / initializing copy and the strip a11y label)
- ❌ Inventing core counts client-side
- ❌ Per-server `fetchServerCell` / metrics series on this page
- ❌ Organization rename form (that belongs on Manage)
