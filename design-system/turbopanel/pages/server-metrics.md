# Page Override: Server Metrics

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers/[serverId]/metrics`.

**Route:** `src/app/[orgId]/servers/[serverId]/metrics` → `server-metrics-section.tsx`  
**Job:** Historical host metrics (v3 contract, 68 named metrics) — grouped charts, coverage honesty, range selection, opt-in live sampling, plus conditional hardware-sensor and Caddy/ProxySQL traffic parts that only appear when the host actually reports them.

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
- **Network:** `interface*BytesPerSecond` chart labeled **Primary interface** (the host's aggregate uplink); `nic1*`/`nic2*BytesPerSecond` charts titled from `server.hardwareProfile.nic1Interface`/`nic2Interface` (falling back to **NIC 1**/**NIC 2** when unbound), hidden when empty; `fabric*BytesPerSecond` chart labeled **TurboFabric** (`TURBOFABRIC_PRODUCT_NAME`). Inline note: NIC 1/2 are taps of the same traffic the primary-interface chart aggregates, not additional throughput, and TurboFabric is a separate interface entirely — none of the four are additive  
- **Hardware:** temperatures (`cpu/gpuTemperatureCelsius`, unit-aware formatter) and power (`cpu/gpuPowerWatts`, W formatter), plus GPU utilization, fan speeds (CPU/GPU/system 1/2), disk temperatures (labelled from `server.hardwareProfile.disk1Temperature`/`disk2Temperature` sensor identity, else "Disk 1"/"Disk 2"), and ambient/board temperatures. The CPU line on the Temperatures and Power charts draws a dashed reference line at the resolved Tjmax/TDP (`data.cpuLimits`, override → catalog-exact → catalog-family → none) with a "N% headroom to Tjmax/TDP" caption under the legend, computed from the latest `derived.cpuThermalHeadroomPercent`/`cpuPowerHeadroomPercent` sample — GPU has no catalog limit in this phase. **Null-hiding rule:** a hardware card renders only when at least one series has a non-null sample in the current range. **Group-hiding rule:** when `data.sensorsAvailable` is `false` (the host has never once reported the `sensors` metrics part — common for VMs), the whole Hardware group is hidden regardless of per-chart data, and a muted line explains why  
- **Traffic:** requests, response status classes (2xx/3xx/4xx/5xx, stacked), HTTP error rate (`derived.httpErrorRatePercent`), request/response bytes (per-interval sums, not a rate — labelled accordingly), HTTP latency (`derived.httpAverageLatencyMs` plus a client-computed "under 100ms %"), requests in flight, and two ProxySQL charts (queries/slow-queries; client/backend connections + backends-up). Every traffic chart hides when empty, so the group naturally shows only the sources (Caddy, ProxySQL) that actually reported. Sum-aggregated charts (requests, status classes, bytes, ProxySQL queries) still carry the shared `gapBands` overlay, so a partially-sampled bucket reads as an amber coverage gap, never a smooth dip  
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

**Temperature units:** every temperature is stored and compared in Celsius. Display converts to the organization's configured unit (`data.temperatureUnit`, riding on the `/series` and `/summary` responses) only at render time — axis labels, tooltips, the headline value, and the Tjmax reference-line label all go through the same unit-aware formatter. Headroom math and the reference-line's plotted Y value always stay in raw Celsius/Watts; only the rendered text converts. The unit itself is edited on `/[orgId]/servers/settings` (`ServerTemperatureUnitSettingsSection`, manage-gated) — this page is read-only with respect to it.

**Generation breaks:** `data.generationBreaks` marks point indices where the hardware-profile generation changed (a sensor identity or NIC binding was reassigned). The UI renders these as solid vertical dividers — distinct from the amber gap-band tint for missing samples — on every chart, so a sensor swap never reads as a continuous trend line spanning two different pieces of hardware.

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
- ❌ Summing the primary interface, NIC 1/2, and TurboFabric throughput  
- ❌ Converting Celsius before a Tjmax/TDP comparison — compare in raw Celsius/Watts, convert only the rendered string  
- ❌ Rendering a traffic chart's sum-aggregated gap as a smooth dip instead of an amber coverage-gap band  
- ❌ DO/cell reads for status  
- ❌ Raw hex outside `theme.ts`
