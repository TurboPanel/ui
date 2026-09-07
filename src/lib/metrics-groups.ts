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
    hint: 'Frequency range, scheduling, and IRQ time — needs the CPU detail capability',
    chartIds: [
      'cpu-detail-frequency',
      'cpu-detail-scheduling',
      'cpu-detail-forks',
      'cpu-detail-irq',
    ],
  },
  {
    id: 'memory-detail',
    label: 'Memory detail',
    hint: 'Slab, dirty, commit, and reclaim breakdown — needs the memory detail capability',
    chartIds: [
      'memory-detail-primary',
      'memory-detail-slab',
      'memory-detail-dirty',
      'memory-detail-other-gauges',
      'memory-detail-commit',
      'memory-detail-active-inactive',
      'memory-detail-reclaim',
      'memory-detail-compaction',
    ],
  },
]
