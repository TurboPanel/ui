# Page Override: Server Metrics

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers/[serverId]/metrics`.

**Route:** `src/app/[orgId]/servers/[serverId]/metrics` → `server-metrics-section.tsx`
**Job:** Historical host metrics (v4 entity-scoped contract) — grouped host charts plus dynamic, presence-gated per-device groups (GPU, additional network devices, filesystems, block devices, physical signals, ingress, database proxy), coverage honesty, range selection, opt-in live sampling, and a compact hardware-health/lifecycle events panel.

---

## Layout

- Page title: `{server name} · Metrics` via `orgPanelStyles.pageTitle`
- Intro copy explains ~60 s baseline sampling; 5m/10m ranges opt into 10 s live sampling
- **Time range** in accent `SectionPanel` with segmented control (`orgPanelStyles.segmentGroup`)
- **Overview tiles** (`StatTiles`) above the chart groups: CPU busy % (`host.cpu.busyPercent`, direct — no longer derived from idle), memory used % (`derived.memoryUsedPercent`), hosting storage used % (hosting-role filesystem, capacity-derived), running/blocked process counts, uptime (from the separate `/metrics/connection` endpoint, not a plotted series) — latest values, not a chart. The v3 uplink tile is gone: v4's host contract has no host-level network-throughput field at all (only `tcpRetransmitPercent`/`softnetDropsPerSecond`)
- **Coverage strip** above chart groups: percent, gap count, resolution meta, amber gap hint — computed from the host series only
- **Collapsible groups:** CPU, Memory, Storage, Network (host-scoped, first three expanded by default) — followed by whichever presence-gated entity groups this server actually has (GPU, Additional network devices, Filesystems, Block devices, Physical signals, Ingress, Database proxy)
- **Recent events** panel: a compact list (kind, severity, entity, source, timestamp) from `/metrics/events`, shown only when at least one event fell in range
- **Sample coverage** detail panel at bottom (present / gaps / expected)

## Host query, then batched entity queries

Most entity ids (GPU/network/filesystem/block-device/hardware-signal identities) are not known ahead of time — they come back on the *response* as `inventory`, not something the client can enumerate up front. `managed.ingress`/`managed.database_proxy` are the exception: the daemon's `IngressAdapterId`/`DatabaseProxyAdapterId` are closed unions (`"caddy" | "traefik"`, `"proxysql"`) rather than topology-enumerated, so those two families' entity ids are always known and requested unconditionally — no discovery needed, no inventory entry required. A source that isn't actually running just comes back absent from the response's `entities[]`.

So this screen makes a host query plus one or more entity queries per range:

1. **Host query** — the fixed list of `host.*` canonical ids (`HOST_METRIC_IDS`), always enabled. Its response carries `host` (the plotted series) *and* `inventory`/`topologyGeneration` regardless of what was requested — `buildTopologyContextV4` runs unconditionally server-side.
2. **Entity queries** — built from the host query's `inventory` (every GPU/block device/hardware signal, every non-root filesystem, every network device with `role: 'other'`) plus the fixed `ingress`/`databaseProxy` source ids, enabled only once that combined id list is non-empty. The id list is split into batches of at most the server's 128-selector budget (`MAX_SERIES_METRIC_SELECTORS_V4`) — a single entity's fields always stay in one batch, but different entities of the same family may land in different batches — and every batch is fetched in parallel (`useServerMetricsSeriesBatches`) and merged before rendering, so a topology larger than one page of selectors never silently loses devices. Each batch's cache key folds in `topologyGeneration` so a mid-session topology change (a device added/removed) doesn't read a stale entity cache keyed only on the visible range.

Every call stays one-per-visible-range (per batch) — the O(1)-in-server-count rule this page has always followed is unchanged, it's just N O(1) calls instead of one.

## Chart groups (v4 entity-metric-id grammar)

- **CPU:** stacked-area chart of `host.cpu.{userPercent,systemPercent,iowaitPercent,stealPercent,softirqPercent}` (v4 dropped `nice`/`irq` — there is no per-mode residual bucket anymore); separate CPU-pressure (PSI, `pressureSomePercent`), busiest-core (`maxCoreBusyPercent`), and processes (`procsRunning`/`procsBlocked`) charts. No Load-average chart — v4's daemon contract carries no load-average metric at all, a deliberate capability loss (same class as v3's `load1/5/15`)
- **Memory:** `host.memory.availableBytes` (raw) + `derived.memoryUsedPercent` (capacity-derived, server-side); `swapUsedBytes` + `derived.swapUsedPercent`; memory-pressure (PSI, some/full); swap I/O (in/out bytes/s); major page faults/s
- **Storage:** I/O pressure (PSI); disk read/write throughput and latency; busiest-block-device %; root filesystem available bytes + `derived.rootFilesystemUsedPercent`; root filesystem free inodes. Non-root filesystems move to the dynamic **Filesystems** group
- **Network (host-scoped):** `host.network.tcpRetransmitPercent`, `softnetDropsPerSecond`, plus `host.kernel.fileHandlesUsedPercent`/`conntrackUsedPercent`. A host's primary NIC slots and TurboFabric devices are **embedded** in host metrics per the current topology and have **no independent per-device series at all** in v4 (Cloudflare Analytics Engine never pages them as standalone `network` rows, and the route explicitly rejects a request for one with a 400) — this replaces v3's fixed Primary-interface/NIC-1/NIC-2/TurboFabric layout entirely. Only network devices with `role: 'other'` (extra NICs beyond the two managed slots and the fabric mesh) get their own chart, in the dynamic **Additional network devices** group below
- **GPU** *(presence: `inventory.gpus.length > 0`)*: per `gpuId` — utilization + memory-activity, memory used bytes, core/memory temperature, power draw, PCIe rx/tx throughput, throttle %. Titled from `vendor`/`chip`
- **Additional network devices** *(presence: any `inventory.networks` entry with `role: 'other'`)*: per device — throughput (rx/tx) and errors/drops (4-series). Titled from the device's reported `name`
- **Filesystems** *(presence: any non-root `inventory.filesystems` entry)*: per filesystem — available bytes and free inodes. Titled from `mountpoint` + `roles`
- **Block devices** *(presence: `inventory.blockDevices.length > 0`)*: per device — throughput, IOPS, latency, utilization %, temperature (hidden when absent), queue depth. Titled from `kernelName`/`model`
- **Physical signals** *(presence: `inventory.hardwareSignals.length > 0`, replaces v3's fixed Hardware group)*: one chart per `signalId`, unit-aware (`celsius`/`watts`/`rpm`/`percent`/other) via the signal's own reported `unit`, with an optional threshold reference line from `.thresholds.critical` (preferred) or `.thresholds.warning`, labeled from `.label`. This is where CPU/GPU/board/ambient/disk temperature, fan, and power readings all live now — v4 moved every physical sensor into this dynamic family instead of v3's fixed CPU-temperature/CPU-power/fan-speeds/disk-temperatures/ambient-board-temperatures slots. There is consequently no Tjmax/TDP headroom caption anymore: `cpuLimits`/`cpuThermalHeadroomPercent`/`cpuPowerHeadroomPercent` are still in the response envelope but v4 has no host-level CPU temperature/power field to pair them with (out of scope for the phase that shipped this cutover, flagged not fixed)
- **Ingress** *(presence: `entities['managed.ingress']` actually contains `caddy` and/or `traefik` this range — not inventory-gated)*: per source — requests & errors, responses by status (2xx/3xx/4xx/5xx, stacked), throughput (request/response bytes), average request duration, requests-under-threshold buckets, upstreams & in-flight, retries. Titled from a fixed `caddy`/`traefik` → `Caddy`/`Traefik` display map, since `sourceId` is one of exactly those two values
- **Database proxy** *(presence: `entities['managed.database_proxy']` actually contains `proxysql` this range — not inventory-gated)*: queries & slow queries, connection errors, client/backend connections, backends up. Titled `ProxySQL` (the only `sourceId` this family ever reports)
- **System (`processCount`/`uptimeSeconds`)** group is gone — it has no v4 host-level replacement (uptime now comes from `/metrics/connection`, not a metrics-store series; process counts moved into the CPU group as `procsRunning`/`procsBlocked`)

Derived percentages (CPU busy, memory/swap/root-filesystem used %) are computed **server-side** now (`DerivedHostValues`) — the v3 client-side `100 − idle` and total/free-byte derivations are gone from this page (`cpuBusyPercent` in `format-metrics.ts` is now a clamping passthrough, not a derivation).

## Charts

- `ChartCard`: accent stripe header, unit subtitle, legend row, inset plot on `bgInset`
- `MetricLineChart`: monospace Y-axis, custom X ticks, gap bands (amber tint), pointer tooltip with series labels
- Stacked mode (`stacked`): multi-series cumulative area bands, straight segments (no curve), tooltip shows per-series values (never cumulative)
- Area fill on single-series percent charts — accent gradient fade
- Legend: swatch + label + monospace last-value pill per series
- Two-column grid on web (`layout.desktopBreakpoint`); single column on narrow viewports
- Entity charts reuse the **host** query's gap bands and generation-break lines rather than computing their own per-entity coverage — one daemon POST per sampling tick writes every family together, so a host-level gap means every family's series has one too

**Temperature units:** every temperature is stored and compared in Celsius. Display converts to the organization's configured unit (`data.temperatureUnit`) only at render time — axis labels, tooltips, the headline value, and physical-signal threshold labels all go through the same unit-aware formatter (`formatPhysicalSignalValue`/`formatCelsiusAs`, both in `format-metrics.ts`). This applies uniformly to GPU temperature, block-device temperature, and physical-signal charts — none of them hard-code Celsius. A physical-signal reference line's plotted `valueY` stays in the metric's raw stored units (Celsius) so `MetricLineChart` positions it correctly on the same raw-unit axis as the series it decorates; only the rendered label text converts to the display unit. The unit itself is edited on `/[orgId]/servers/settings` (`ServerTemperatureUnitSettingsSection`, manage-gated) — this page is read-only with respect to it.

**Generation breaks:** `data.host.topologyGenerationBreaks` (v4's rename of v3's `generationBreaks`) marks point indices where the topology generation changed — a NIC/filesystem/GPU/sensor identity was reassigned. Rendered as solid vertical dividers, distinct from the amber gap-band tint, on every chart (host and entity alike, since both share one absolute time axis) so a hardware swap never reads as one continuous trend line spanning two different physical devices.

## Range picker & live mode

- Segmented chips: 5m · 10m · 1h · 6h · 24h · 7d · 30d · 90d
- Active chip: `bgActive` + accent border
- Auto-refresh: 60 s (1h/6h), 300 s (24h), off for longer ranges
- **Live mode** (5m/10m only, this single-server screen only — never fleet views): selecting the range starts a live lease (`POST …/metrics/live`); both the host and entity charts refetch every 10 s while the lease is active
- Live indicator states: `LIVE · 10 second sampling` (green dot) while the lease is active → `Live session ended · 1 minute sampling` with a **Restart live session** button after expiry
- `409 live_metrics_disabled` → silent fallback to 60 s refresh, no indicator; `409 server_offline` → small inline notice
- Leaving the range or the page stops the lease (fire-and-forget `DELETE …/metrics/live`)

## States (intentional, not janky)

| State | Presentation |
|-------|----------------|
| Loading | Accent spinner; charts hidden until first payload |
| Unsupported OS | `statePanel` — non-Linux only |
| Backend unavailable | `statePanel` + Retry (DuckDB / Analytics Engine label) |
| Not configured | Generic "metrics storage not configured" copy (the v3 TurboPanel-HA-vs-self-hosted branch collapsed since the v4 cutover dropped the Analytics-Engine-specific message) |
| No data | Waiting for first samples (immediate on connect; rates in ~2 s). If the host is connected but sending an older metrics protocol, **Daemon update required** with an **Update daemon** action |
| Offline server | Pending left-border banner when charts still render |
| Per-chart unavailable | Muted inline message inside card — not empty plot (entity/hideWhenEmpty cards hide instead) |
| Live ended | Muted inline row + Restart live session button |
| No events in range | Recent events panel omitted entirely, not an empty state |

## Motion

- Group expand/collapse: instant (no height animation); every dynamic entity group defaults to collapsed (only the first two static host groups — CPU, Memory — default open, same as v3)
- Range chip press: opacity ~0.88
- No perpetual chart animation — static historical lines (live mode redraws on refetch, no streaming animation)

## Anti-patterns

- ❌ Live sampling anywhere but the single-server Metrics screen (fleet views stay ~1 min)
- ❌ Rendering an entity chart with all-null samples (hide the card)
- ❌ Requesting a `network`-family entity id that resolves to a slot-mapped or fabric device — the route rejects it with a 400; only `role: 'other'` devices are independently queryable
- ❌ Treating `ingress`/`databaseProxy` `sourceId` as open-ended or inventory-gated — it's a fixed closed set (`caddy`/`traefik`/`proxysql`), always requested; gate group visibility on whether the source actually appears in the response, not on a topology inventory entry
- ❌ Converting Celsius before a threshold comparison, or before plotting a reference line's `valueY` — compare/plot in raw Celsius, convert only the rendered string
- ❌ Silently truncating the entity id list at the server's selector cap — batch and merge instead (see above)
- ❌ Re-deriving `memoryUsedPercent`/`swapUsedPercent`/`rootFilesystemUsedPercent` client-side — always read `derived.*`, server-computed
- ❌ DO/cell reads for status
- ❌ Raw hex outside `theme.ts`

## Note on process

This page's chart-group layout changed materially (five new presence-gated groups, the Network/Hardware/Traffic/System groups reshaped or removed). The repo convention is to run the `ui-ux-pro-max` skill before finalizing group ordering/empty-state copy for a change like this; that skill was not available in the session that authored this cutover, so the ordering/copy above should be treated as a first pass pending that review.
