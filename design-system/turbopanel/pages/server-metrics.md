# Page Override: Server Metrics

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers/[serverId]/metrics`.

**Route:** `src/app/[orgId]/servers/[serverId]/metrics` → `server-metrics-section.tsx`  
**Job:** Historical host metrics — paired charts, coverage honesty, range selection.

---

## Layout

- Page title: `{server name} · Metrics` via `orgPanelStyles.pageTitle`  
- Intro copy explains ~60 s sampling — not live sub-second data  
- **Time range** in accent `SectionPanel` with segmented control (`orgPanelStyles.segmentGroup`)  
- **Coverage strip** above chart groups: percent, gap count, resolution meta, amber gap hint  
- **Collapsible groups:** Compute, Memory, Disk, Network, System — first two expanded by default  
- **Sample coverage** detail panel at bottom (present / gaps / expected)

## Charts

- One combined series fetch per visible range — O(1) rule unchanged  
- `ChartCard`: accent stripe header, unit subtitle, legend row, inset plot on `bgInset`  
- `MetricLineChart`: monospace Y-axis, custom X ticks, gap bands (amber tint), pointer tooltip with series labels  
- Area fill on single-series percent charts (disk usage) — accent gradient fade  
- Legend: swatch + label + monospace last-value pill per series  
- Two-column grid on web (`layout.desktopBreakpoint`); single column on narrow viewports

## Range picker

- Segmented chips: 1h · 6h · 24h · 7d · 30d · 90d  
- Active chip: `bgActive` + accent border  
- Auto-refresh: 60 s (1h/6h), 300 s (24h), off for longer ranges

## States (intentional, not janky)

| State | Presentation |
|-------|----------------|
| Loading | Accent spinner; charts hidden until first payload |
| Unsupported OS | `statePanel` — non-Linux only |
| Backend unavailable | `statePanel` + Retry (ClickHouse / Analytics Engine label) |
| Not configured | TurboPanel High Availability vs self-hosted copy via `platform-copy` patterns |
| No data | Waiting for first samples (~1 min after connect) |
| Offline server | Pending left-border banner when charts still render |
| Per-chart unavailable | Muted inline message inside card — not empty plot |

## Motion

- Group expand/collapse: instant (no height animation)  
- Range chip press: opacity ~0.88  
- No perpetual chart animation — static historical lines

## Anti-patterns

- ❌ Real-time streaming UX (this is not a live dashboard)  
- ❌ Fetching all 20 metrics in one view  
- ❌ DO/cell reads for status  
- ❌ Raw hex outside `theme.ts`
