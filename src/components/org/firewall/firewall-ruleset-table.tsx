import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  Badge,
  Button,
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  MonoText,
  SegmentedControl,
  TextField,
  type BadgeTone,
  type DataTableColumn,
  type SegmentedOption,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  EMPTY_RULESET_FILTER,
  RULESET_ACTION_LABELS,
  RULESET_CATEGORY_LABELS,
  RULESET_CHAIN_LABELS,
  filterRulesetRows,
  rulesetCategoryCounts,
  rulesetFamilyLabel,
  rulesetPositionLabel,
  rulesetRows,
  type RulesetAction,
  type RulesetCategory,
  type RulesetFamily,
  type RulesetFilter,
  type RulesetRow,
} from '@/lib/firewall-ruleset'
import { colors, spacing } from '@/lib/theme'

const COLUMNS = {
  position: { key: 'position', header: '#', width: 36 },
  name: { key: 'name', header: 'Name', flex: 2.4, minWidth: 180, gap: 2 },
  category: { key: 'category', header: 'Category', flex: 1.2, minWidth: 120 },
  chain: { key: 'chain', header: 'Applies To', flex: 1.1, minWidth: 110 },
  protocol: { key: 'protocol', header: 'Protocol', width: 76 },
  port: { key: 'port', header: 'Port', width: 96 },
  source: { key: 'source', header: 'From', flex: 1.3, minWidth: 130 },
  action: { key: 'action', header: 'Action', width: 128 },
  family: { key: 'family', header: 'IP', width: 96 },
} satisfies Record<string, DataTableColumn>

const COLUMN_LIST: readonly DataTableColumn[] = Object.values(COLUMNS)
const TABLE_MIN_WIDTH = 1100

const ACTION_TONES: Record<RulesetAction, BadgeTone> = {
  allow: 'ok',
  pass: 'info',
  drop: 'danger',
  reject: 'danger',
  other: 'muted',
}

const CATEGORY_TONES: Record<RulesetCategory, BadgeTone> = {
  system: 'muted',
  derived: 'info',
  user: 'pending',
  other: 'muted',
}

const FAMILY_OPTIONS: readonly SegmentedOption<RulesetFamily | 'all'>[] = [
  { value: 'all', label: 'All' },
  { value: 'v4', label: 'IPv4' },
  { value: 'v6', label: 'IPv6' },
]

function categoryOptions(rows: readonly RulesetRow[]): SegmentedOption<RulesetCategory | 'all'>[] {
  const counts = rulesetCategoryCounts(rows)
  const options: SegmentedOption<RulesetCategory | 'all'>[] = [
    { value: 'all', label: `All (${rows.length})` },
  ]
  for (const category of ['system', 'derived', 'user', 'other'] as const) {
    // "Other" only appears when the server rendered a line this screen cannot place.
    if (category === 'other' && counts.other === 0) continue
    options.push({
      value: category,
      label: `${RULESET_CATEGORY_LABELS[category]} (${counts[category]})`,
    })
  }
  return options
}

function countText(shown: number, total: number, filtered: boolean): string {
  if (filtered) return `Showing ${shown} of ${total} rows`
  return total === 1 ? '1 row' : `${total} rows`
}

function RulesetTableRow({
  row,
  family,
  expanded,
  onToggle,
  last,
  alt,
}: Readonly<{
  row: RulesetRow
  family: RulesetFamily | 'all'
  expanded: boolean
  onToggle: () => void
  last: boolean
  alt: boolean
}>) {
  return (
    <>
      <DataTableRow
        onPress={onToggle}
        expanded={expanded}
        accessibilityLabel={`${row.name}, ${RULESET_ACTION_LABELS[row.action]}. Show the rendered line.`}
        last={last && !expanded}
        alt={alt}
      >
        <DataTableCell column={COLUMNS.position}>
          <Text style={styles.dim}>{rulesetPositionLabel(row, family)}</Text>
        </DataTableCell>
        <DataTableCell column={COLUMNS.name}>
          <Text style={styles.name} numberOfLines={2}>
            {row.name}
          </Text>
          {row.details.length > 0 ? (
            <Text style={styles.sub} numberOfLines={2}>
              {row.details.join(' · ')}
            </Text>
          ) : null}
        </DataTableCell>
        <DataTableCell column={COLUMNS.category}>
          <Badge
            tone={CATEGORY_TONES[row.category]}
            label={RULESET_CATEGORY_LABELS[row.category]}
          />
        </DataTableCell>
        <DataTableCell column={COLUMNS.chain}>
          <Text style={styles.cell}>{RULESET_CHAIN_LABELS[row.chain]}</Text>
        </DataTableCell>
        <DataTableCell column={COLUMNS.protocol}>
          <Text style={styles.cell}>{row.protocol}</Text>
        </DataTableCell>
        <DataTableCell column={COLUMNS.port}>
          {row.port ? <MonoText>{row.port}</MonoText> : <Text style={styles.dim}>Any</Text>}
        </DataTableCell>
        <DataTableCell column={COLUMNS.source}>
          {row.source ? (
            <MonoText numberOfLines={1}>{row.source}</MonoText>
          ) : (
            <Text style={styles.dim}>Anyone</Text>
          )}
        </DataTableCell>
        <DataTableCell column={COLUMNS.action}>
          <Badge tone={ACTION_TONES[row.action]} label={RULESET_ACTION_LABELS[row.action]} />
        </DataTableCell>
        <DataTableCell column={COLUMNS.family}>
          <Text style={styles.cell}>{rulesetFamilyLabel(row.families)}</Text>
        </DataTableCell>
      </DataTableRow>
      {expanded ? (
        <View style={[styles.expanded, last && styles.expandedLast]}>
          <Text style={styles.expandedLabel}>
            Rendered line · {row.chainName}
            {row.ruleId ? ` · ${row.ruleId}` : ''}
          </Text>
          <MonoText selectable style={styles.raw}>
            {row.raw}
          </MonoText>
        </View>
      ) : null}
    </>
  )
}

/**
 * The rendered ruleset as one searchable table: both families together, one
 * row per rendered line, in the order the server checks them within each chain.
 * Tap a row for the exact line. Filters never change what the server got; they
 * only narrow what is shown.
 */
export function FirewallRulesetTable({
  rendered,
}: Readonly<{ rendered: { v4: string; v6: string | null } }>) {
  const rows = useMemo(() => rulesetRows(rendered), [rendered])
  const [filter, setFilter] = useState<RulesetFilter>(EMPTY_RULESET_FILTER)
  const [open, setOpen] = useState<string | null>(null)
  // With no IPv6 ruleset the IP filter is hidden, so a stale IPv6 choice must not apply.
  const family = rendered.v6 === null ? 'all' : filter.family
  const effective = useMemo(() => ({ ...filter, family }), [filter, family])
  const visible = useMemo(() => filterRulesetRows(rows, effective), [rows, effective])
  const filtered = filter.query.trim() !== '' || filter.category !== 'all' || family !== 'all'

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <View style={styles.search}>
          <TextField
            label="Search"
            value={filter.query}
            onChangeText={(query) => setFilter((prev) => ({ ...prev, query }))}
            placeholder="Name, port, address, action…"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="search"
            accessibilityLabel="Search the rendered ruleset"
          />
        </View>
      </View>
      <View style={styles.filters}>
        <SegmentedControl
          options={categoryOptions(rows)}
          value={filter.category}
          accessibilityLabel="Filter by category"
          onChange={(category) => setFilter((prev) => ({ ...prev, category }))}
        />
        {rendered.v6 === null ? null : (
          <SegmentedControl
            options={FAMILY_OPTIONS}
            value={family}
            accessibilityLabel="Filter by IP version"
            onChange={(family) => setFilter((prev) => ({ ...prev, family }))}
          />
        )}
      </View>
      <View style={styles.countRow}>
        <Text style={panelStyles.muted}>
          {countText(visible.length, rows.length, filtered)}
          {family === 'all' && rendered.v6 !== null
            ? ' · checked top to bottom within each chain, first match wins; # reads IPv4 / IPv6 where they differ'
            : ' · checked top to bottom within each chain; the first match wins'}
        </Text>
        {filtered ? (
          <Button label="Clear Filters" size="sm" onPress={() => setFilter(EMPTY_RULESET_FILTER)} />
        ) : null}
      </View>
      <DataTable columns={COLUMN_LIST} minWidth={TABLE_MIN_WIDTH}>
        {visible.length === 0 ? (
          <DataTableEmpty>
            {rows.length === 0
              ? 'The server rendered no rule lines.'
              : 'No lines match. Try a port number, an address or a shorter word, or clear the filters.'}
          </DataTableEmpty>
        ) : (
          visible.map((row, index) => (
            <RulesetTableRow
              key={row.key}
              row={row}
              family={family}
              expanded={open === row.key}
              onToggle={() => setOpen((prev) => (prev === row.key ? null : row.key))}
              last={index === visible.length - 1}
              alt={index % 2 === 1}
            />
          ))
        )}
      </DataTable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  search: {
    flexGrow: 1,
    flexBasis: 240,
    maxWidth: 480,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textBody,
  },
  sub: {
    fontSize: 12,
    color: colors.textMuted,
  },
  cell: {
    fontSize: 13,
    color: colors.textBody,
  },
  dim: {
    fontSize: 13,
    color: colors.textMuted,
  },
  expanded: {
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgSecondary,
  },
  expandedLast: {
    borderBottomWidth: 0,
  },
  expandedLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.textMuted,
  },
  raw: {
    fontSize: 12,
  },
})
