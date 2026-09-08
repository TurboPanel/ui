/**
 * Which charts belong to which collapsible section, and what a collapsed
 * section summarises.
 *
 * Pure data, deliberately kept out of the screen component: the renderer
 * resolves `chartIds` against the chart definitions and **silently drops any
 * id it cannot find**, so a renamed or deleted chart vanishes from the UI
 * with no error at all. Three ids had rotted that way by the time v5 landed
 * (`cpu-max-core`, `memory-available`, `disk-max-util`). Living here lets
 * `metrics-groups.test.ts` cross-check the wiring without importing the
 * component (and with it, react-native).
 */

export type HostChartGroup = {
  id: string
  label: string
  hint: string
  chartIds: readonly string[]
}

export type GroupSummarySpec = {
  chartId: string
  seriesId?: string
  max?: number
  thresholds?: { warning: number; critical: number }
  /**
   * An up-vs-total pair read as `N of M` (`reachabilitySummary`) instead of
   * a single headline series — the bars plot `N / M` and the chip fires on a
   * *low* figure, the opposite of `thresholds`. `seriesId` / `max` /
   * `thresholds` are ignored when this is set.
   */
  reachability?: { upSeriesId: string; totalSeriesId: string }
}

/**
 * What a collapsed section shows instead of nothing: which chart supplies its
 * mini bar chart, whether that metric has a known ceiling, and the thresholds
 * that raise a state chip.
 *
 * Keyed by group id. A group without an entry still collapses, it just shows
 * no summary — better than inventing a figure for a group whose "primary"
 * metric is ambiguous.
 */
export const GROUP_SUMMARY_SPECS: Readonly<Record<string, GroupSummarySpec>> = {
  cpu: { chartId: 'cpu-modes', max: 100, thresholds: { warning: 85, critical: 95 } },
  memory: { chartId: 'memory-percent', max: 100, thresholds: { warning: 85, critical: 95 } },
  storage: { chartId: 'storage-io-pressure', max: 100, thresholds: { warning: 50, critical: 80 } },
  network: { chartId: 'network-retransmit', max: 100 },
  paging: { chartId: 'memory-swap-io' },
  // The Router header answers "can Traefik reach its backends?" as
  // `backendsUp of backendsTotal` — the one figure an operator wants
  // without opening the section. The header renders whether or not the
  // section is expanded, so this is the always-visible reachability readout.
  router: { chartId: 'router-backends', reachability: { upSeriesId: 'up', totalSeriesId: 'total' } },
}

export const HOST_CHART_GROUPS: readonly HostChartGroup[] = [
  {
    id: 'cpu',
    label: 'CPU',
    hint: 'Utilisation, pressure, and what is waiting to run',
    chartIds: ['cpu-modes', 'cpu-pressure', 'cpu-saturated-cores', 'cpu-processes'],
  },
  {
    id: 'memory',
    label: 'Memory',
    hint: 'What RAM is being used for, and how hard the kernel is working to find more',
    chartIds: [
      'memory-breakdown',
      'memory-percent',
      'swap-bytes',
      'swap-percent',
      'memory-pressure',
    ],
  },
  {
    // Swap in/out and disk-backed memory reads all mean the same thing —
    // you are out of RAM — so they belong together rather than scattered
    // through Memory. They stay two charts because one is bytes/second and
    // the other is faults/second; sharing an axis would misrepresent both.
    id: 'paging',
    label: 'Paging',
    hint: 'Swap traffic and memory reads served from disk — the out-of-RAM signals',
    chartIds: ['memory-swap-io', 'memory-major-faults'],
  },
  {
    id: 'storage',
    label: 'Storage',
    hint: 'Host I/O pressure, throughput, latency, and root filesystem capacity',
    chartIds: [
      'storage-io-pressure',
      'disk-throughput',
      'disk-latency',
      'root-filesystem-bytes',
      'root-filesystem-percent',
      'root-filesystem-inodes',
    ],
  },
  {
    id: 'network',
    label: 'Network',
    hint: 'Host-level network and kernel resource pressure',
    chartIds: ['network-retransmit', 'network-softnet-drops', 'kernel-resources'],
  },
  {
    id: 'cpu-detail',
    label: 'CPU detail',
    hint: 'Frequency range, scheduling, and IRQ time — reported by every Linux host',
    chartIds: [
      'cpu-detail-frequency',
      'cpu-detail-scheduling',
      'cpu-detail-forks',
      'cpu-detail-irq',
    ],
  },
  {
    // Host-wide singleton (`managed.router`, v6): the shared hosting Traefik
    // that fronts every site on this host. It used to be one of the
    // `managed.ingress` sources; the Ingress group below is Caddy-only now.
    id: 'router',
    label: 'Router',
    hint: 'Shared HTTP router — backends reachable, retries, 5xx, latency, config reloads and their age, soonest TLS expiry',
    chartIds: [
      'router-backend-requests',
      'router-backend-latency',
      'router-backends',
      'router-connections',
      'router-config',
      'router-config-age',
      'router-tls-expiry',
    ],
  },
  {
    // `managed.storage` — where the host's bytes actually went. Distinct
    // from `storage` above (block-layer I/O + root capacity): that answers
    // "how is the disk behaving", this answers "what is consuming it".
    id: 'managed-storage',
    label: 'Storage usage',
    hint: 'Hosting, backup, Docker, and log directory usage with the free space left to grow into, plus the managed-database census',
    chartIds: [
      'managed-storage-hosting',
      'managed-storage-backup',
      'managed-storage-docker',
      'managed-storage-logs',
      'managed-storage-engines',
      'managed-storage-connections',
    ],
  },
  {
    // `managed.docker` — Docker's own `/system/df` breakdown. Hidden
    // entirely (with a notice in its place) on the entry tier, where the
    // capability plan does not grant the family; see `server-metrics.md`.
    id: 'managed-docker',
    label: 'Docker',
    hint: 'Image layers, containers, volumes, and build cache — with what a prune would reclaim',
    chartIds: [
      'managed-docker-layers',
      'managed-docker-containers',
      'managed-docker-volumes',
      'managed-docker-build-cache',
      'managed-docker-counts',
    ],
  },
  {
    id: 'memory-detail',
    label: 'Memory detail',
    hint: 'Slab, dirty, commit, and reclaim breakdown — reported by every Linux host',
    chartIds: [
      'memory-detail-primary',
      'memory-detail-slab',
      'memory-detail-dirty',
      'memory-detail-other-gauges',
      'memory-detail-commit',
      'memory-detail-reclaim',
      'memory-detail-compaction',
    ],
  },
]
