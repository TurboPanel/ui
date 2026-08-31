# Page Override: Server Metrics

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers/[serverId]/metrics`.

**Route:** `src/app/[orgId]/servers/[serverId]/metrics` → `server-metrics-section.tsx`  
**Job:** Historical host metrics (v2 contract, 38 named metrics) — grouped charts, coverage honesty, range selection, opt-in live sampling.

---

## Layout

- Page title: `{server name} · Metrics` via `orgPanelStyles.pageTitle`  
- Intro copy explains ~60 s baseline sampling; 5m/10m ranges opt into 10 s live sampling  
- **Time range** in accent `SectionPanel` with segmented control (`orgPanelStyles.segmentGroup`)  
- **Overview tiles** (`StatTiles`) above the chart groups: derived CPU busy, memory used %, hosting storage used %, uplink throughput, processes, uptime — latest values, not a chart  
- **Coverage strip** above chart groups: percent, gap count, resolution meta, amber gap hint  
- **Collapsible groups:** CPU, Memory, Storage, Network, Hardware, System — first two expanded by default  
- **Sample coverage** detail panel at bottom (present / gaps / expected)

## Chart groups (v2 keys)

- **CPU:** cumulative stacked-area CPU-mode chart, stacked bottom-up as `cpuUserPercent`, `cpuSystemPercent`, `cpuNicePercent`, `cpuIowaitPercent`, `cpuIrqPercent`, `cpuSoftirqPercent`, `cpuStealPercent` with `cpuIdlePercent` explicit on top (muted band) — the stack sums to ~100% so idle headroom is directly visible, never a derived busy-line substitute; separate Load chart (`load1/5/15`)  
- **Memory:** bytes chart (`memoryTotalBytes` / `memoryAvailableBytes` / `memoryFreeBytes`) + derived used-% chart; Swap bytes (`swapTotalBytes` / `swapFreeBytes`) + derived used-%  
- **Storage:** capacity pairs for system / hosting / docker (`*TotalBytes` / `*AvailableBytes`), disk throughput, IOPS, latency (`diskRead/WriteLatencyMs`, ms formatter). The docker capacity card renders only when at least one non-null sample exists in the range  
- **Network:** `uplink*BytesPerSecond` chart labeled **Datacenter uplink**; `fabric*BytesPerSecond` chart labeled **TurboFabric** (`TURBOFABRIC_PRODUCT_NAME`); inline note that the two are measured independently and are non-additive  
- **Hardware:** temperatures (`cpu/gpuTemperatureCelsius`, °C formatter) and power (`cpu/gpuPowerWatts`, W formatter). **Null-hiding rule:** a hardware card renders only when at least one series has a non-null sample in the current range — a missing sensor must never paint a 0-value flatline; when every card in the group is hidden the whole group disappears  
- **System:** `processCount`, `uptimeSeconds`

Derived percentages (CPU busy, memory/swap/storage used %) are computed client-side — the v2 contract stores no derived values.

## Charts

- One combined series fetch per visible range — O(1) rule unchanged  
- `ChartCard`: accent stripe header, unit subtitle, legend row, inset plot on `bgInset`  
- `MetricLineChart`: monospace Y-axis, custom X ticks, gap bands (amber tint), pointer tooltip with series labels  
- Stacked mode (`stacked`): multi-series cumulative area bands, straight segments (no curve), tooltip shows per-series values (never cumulative)  
- Area fill on single-series percent charts — accent gradient fade  
- Legend: swatch + label + monospace last-value pill per series  
- Two-column grid on web (`layout.desktopBreakpoint`); single column on narrow viewports

## Range picker & live mode

- Segmented chips: 5m · 10m · 1h · 6h · 24h · 7d · 30d · 90d  
- Active chip: `bgActive` + accent border  
- Auto-refresh: 60 s (1h/6h), 300 s (24h), off for longer ranges  
- **Live mode** (5m/10m only, this single-server screen only — never fleet views): selecting the range starts a live lease (`POST …/metrics/live`); charts refetch every 10 s while the lease is active  
- Live indicator states: `LIVE · 10 second sampling` (green dot) while the lease is active → `Live session ended · 1 minute sampling` with a **Restart live session** button after expiry  
- `409 live_metrics_disabled` → silent fallback to 60 s refresh, no indicator; `409 server_offline` → small inline notice  
- Leaving the range or the page stops the lease (fire-and-forget `DELETE …/metrics/live`)

## States (intentional, not janky)

| State | Presentation |
|-------|----------------|
| Loading | Accent spinner; charts hidden until first payload |
| Unsupported OS | `statePanel` — non-Linux only |
| Backend unavailable | `statePanel` + Retry (DuckDB / Analytics Engine label) |
| Not configured | TurboPanel High Availability vs self-hosted copy via `platform-copy` patterns |
| No data | Waiting for first samples (immediate on connect; rates in ~2 s) |
| Offline server | Pending left-border banner when charts still render |
| Per-chart unavailable | Muted inline message inside card — not empty plot (hardware cards hide instead) |
| Live ended | Muted inline row + Restart live session button |

## Motion

- Group expand/collapse: instant (no height animation)  
- Range chip press: opacity ~0.88  
- No perpetual chart animation — static historical lines (live mode redraws on refetch, no streaming animation)

## Anti-patterns

- ❌ Live sampling anywhere but the single-server Metrics screen (fleet views stay ~1 min)  
- ❌ Rendering a hardware sensor chart with all-null samples (hide the card)  
- ❌ Summing uplink and TurboFabric throughput  
- ❌ DO/cell reads for status  
- ❌ Raw hex outside `theme.ts`
