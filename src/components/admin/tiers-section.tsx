import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  Badge,
  Button,
  ButtonRow,
  ConfirmButton,
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  InlineNotice,
  MonoText,
  SectionPanel,
  Select,
  TextField,
} from '@/components/ui'
import { isSuperadminSession, useAuth } from '@/lib/auth-context'
import type {
  AdminTier,
  AdminTierDefaultEntry,
  AdminTierVerification,
} from '@/lib/instance-api'
import {
  useAdminTierDefaults,
  useAdminTiers,
  useCreateAdminTier,
  useDeactivateAdminTier,
  usePatchAdminTier,
  useVerifyAdminTier,
  useVerifyAllAdminTiers,
} from '@/lib/queries/admin'
import {
  availableDefaults,
  createBodyFromForm,
  currentGeneration,
  emptyFormState,
  formatCores,
  formatMemory,
  formatPrice,
  formatSlots,
  formStateFromDefault,
  localFormProblems,
  referenceSummary,
  sortTiers,
  stripeRecipe,
  type TierFormState,
  verifyBadge,
} from '@/lib/tier-form'
import { colors, spacing } from '@/lib/theme'

const COLUMNS = [
  { key: 'tier', header: 'Tier', flex: 1.1, minWidth: 120 },
  { key: 'price', header: 'Price', flex: 0.8, minWidth: 90 },
  { key: 'priceId', header: 'Stripe price', flex: 1.7, minWidth: 190 },
  { key: 'fits', header: 'Fits', flex: 1.1, minWidth: 130 },
  { key: 'slots', header: 'Slots', flex: 1.6, minWidth: 190 },
  { key: 'used', header: 'In use', flex: 1, minWidth: 110 },
  { key: 'state', header: 'State', flex: 0.8, minWidth: 100 },
] as const

/**
 * The three steps, in the order they actually happen. Spelled out because the
 * whole flow spans two products and the Stripe half cannot be automated —
 * there is no seed script any more, by design.
 */
function HowItWorks() {
  return (
    <InlineNotice
      title="Create it in Stripe first, then enter it here"
      body={
        '1 · In the Stripe Dashboard: Products → Add product, then add a recurring, ' +
        'monthly, per-unit price in USD with a tax behaviour set.\n' +
        '2 · Copy the price_… id.\n' +
        '3 · Below: pick the tier from the ladder, paste the id, save. The id is ' +
        'checked against Stripe before the row is written — a wrong one is silent ' +
        'otherwise, and would quietly lose entitlement.'
      }
    />
  )
}

/** What to type into the Stripe Dashboard for the selected tier, field by field. */
function StripeRecipeCard({ entry }: Readonly<{ entry: AdminTierDefaultEntry }>) {
  const recipe = stripeRecipe(entry)
  if (!recipe) {
    return (
      <View style={styles.recipe}>
        <Text style={styles.recipeTitle}>Nothing to create in Stripe</Text>
        <Text style={styles.recipeLine}>
          {entry.label} is negotiated per customer: the row carries no list price and no
          price id. Create that customer&apos;s own price when a deal exists, then set it
          on this row.
        </Text>
      </View>
    )
  }
  const rows: [string, string][] = [
    ['Product name', recipe.productName],
    ['Price', `${recipe.amount} ${recipe.currency}`],
    ['Billing period', recipe.interval],
    ['Pricing model', recipe.billing],
    ['Tax behaviour', recipe.taxBehaviour],
  ]
  return (
    <View style={styles.recipe}>
      <Text style={styles.recipeTitle}>Create this in Stripe</Text>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.recipeRow}>
          <Text style={styles.recipeLabel}>{label}</Text>
          <Text style={styles.recipeValue}>{value}</Text>
        </View>
      ))}
    </View>
  )
}

function VerificationDetail({
  verification,
}: Readonly<{ verification: AdminTierVerification | null | undefined }>) {
  if (!verification) return null
  if (verification.ok) {
    const price = verification.price
    return (
      <View style={styles.verifyOk}>
        <Text style={styles.verifyOkText}>
          Verified{price?.productName ? ` — ${price.productName}` : ''}
          {price?.livemode ? ' · live mode' : ' · test mode'}
        </Text>
      </View>
    )
  }
  return (
    <View style={styles.verifyBad}>
      {verification.failures.map((failure) => (
        <Text key={failure} style={styles.verifyBadText}>
          • {failure}
        </Text>
      ))}
    </View>
  )
}

function TierRow({
  tier,
  verification,
  busy,
  stateBusy,
  onVerify,
  onDeactivate,
  onReactivate,
}: Readonly<{
  tier: AdminTier
  verification: AdminTierVerification | undefined
  busy: boolean
  stateBusy: boolean
  onVerify: () => void
  onDeactivate: () => void
  onReactivate: () => void
}>) {
  const badge = verifyBadge(tier, verification, busy)
  return (
    <DataTableRow>
      <DataTableCell column={COLUMNS[0]}>
        <Text style={styles.tierLabel}>{tier.label}</Text>
        <Text style={styles.subLine}>
          gen {tier.generation} · rank {tier.rank}
          {tier.isCustom ? ' · custom' : ''}
        </Text>
      </DataTableCell>
      <DataTableCell column={COLUMNS[1]}>
        <Text style={styles.cellText}>{formatPrice(tier.priceCents)}</Text>
        {tier.priceCents !== null ? <Text style={styles.subLine}>/seat/month</Text> : null}
      </DataTableCell>
      <DataTableCell column={COLUMNS[2]}>
        {tier.providerPriceId ? (
          <MonoText style={styles.cellText}>{tier.providerPriceId}</MonoText>
        ) : (
          <Text style={styles.subLine}>—</Text>
        )}
        <View style={styles.badgeRow}>
          <Badge label={badge.label} tone={badge.tone} />
          {tier.providerPriceId ? (
            <Button label="Verify" size="sm" onPress={onVerify} busy={busy} />
          ) : null}
        </View>
        {verification && !verification.ok ? (
          <VerificationDetail verification={verification} />
        ) : null}
      </DataTableCell>
      <DataTableCell column={COLUMNS[3]}>
        <Text style={styles.cellText}>{formatCores(tier.entitlements.maxCores)} cores</Text>
        <Text style={styles.subLine}>{formatMemory(tier.entitlements.maxMemoryBytes)}</Text>
      </DataTableCell>
      <DataTableCell column={COLUMNS[4]}>
        <Text style={styles.cellText}>{formatSlots(tier.entitlements)}</Text>
      </DataTableCell>
      <DataTableCell column={COLUMNS[5]}>
        <Text style={styles.cellText}>{referenceSummary(tier)}</Text>
        {!tier.entitlementsEditable ? (
          <Text style={styles.subLine}>entitlements locked</Text>
        ) : null}
      </DataTableCell>
      <DataTableCell column={COLUMNS[6]}>
        <Badge label={tier.isActive ? 'Active' : 'Retired'} tone={tier.isActive ? 'ok' : 'muted'} />
        <View style={styles.badgeRow}>
          {tier.isActive ? (
            <ConfirmButton
              label="Retire"
              confirmLabel="Retire it"
              prompt={`Stop selling ${tier.label}?`}
              busy={stateBusy}
              onConfirm={onDeactivate}
            />
          ) : (
            // Retiring is reversible on purpose: the row is never deleted,
            // so a misclick is one press back rather than a database trip.
            <Button label="Reactivate" size="sm" busy={stateBusy} onPress={onReactivate} />
          )}
        </View>
      </DataTableCell>
    </DataTableRow>
  )
}

function AddTierForm({
  defaults,
  tiers,
  generation,
}: Readonly<{
  defaults: ReturnType<typeof useAdminTierDefaults>['data']
  tiers: readonly AdminTier[]
  generation: number
}>) {
  const [state, setState] = useState<TierFormState>(() => emptyFormState(generation))
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [saved, setSaved] = useState<string | null>(null)
  const create = useCreateAdminTier()

  const options = useMemo(
    () =>
      availableDefaults(defaults, tiers, generation).map((entry) => ({
        value: entry.label,
        label: entry.label,
        detail: entry.priceCents === null
          ? 'Negotiated — no list price'
          : `${formatPrice(entry.priceCents)}/seat · ${formatCores(entry.maxCores)} cores`,
      })),
    [defaults, tiers, generation]
  )

  const selectedEntry = defaults?.tiers.find((entry) => entry.label === selectedLabel) ?? null
  const problems = localFormProblems(state, defaults)
  const update = (patch: Partial<TierFormState>) => setState((prev) => ({ ...prev, ...patch }))

  const pickDefault = (label: string | null) => {
    setSelectedLabel(label)
    setSaved(null)
    setWarnings([])
    const entry = label === null
      ? undefined
      : defaults?.tiers.find((row) => row.label === label)
    setState(entry ? formStateFromDefault(entry, generation) : emptyFormState(generation))
  }

  const submit = async () => {
    setSaved(null)
    const result = await create.run(createBodyFromForm(state))
    if (!result.ok) return
    setWarnings(result.value.warnings ?? [])
    setSaved(`${result.value.tier.label} added`)
    setSelectedLabel(null)
    setState(emptyFormState(generation))
  }

  return (
    <SectionPanel
      title="Add a tier"
      hint="Everything but the Stripe price id is prefilled from the shipped ladder."
    >
      <View style={styles.formBody}>
        <Select
          value={selectedLabel}
          options={options}
          placeholder={
            options.length === 0
              ? `Generation ${generation} already has every ladder tier`
              : 'Add from defaults — pick a tier'
          }
          disabled={options.length === 0}
          accessibilityLabel="Tier to add from the shipped ladder"
          onChange={pickDefault}
        />

        {selectedEntry ? <StripeRecipeCard entry={selectedEntry} /> : null}

        {selectedLabel ? (
          <>
            {!state.isCustom ? (
              <TextField
                label="Stripe price id"
                hint="Paste the price_… id from the Stripe Dashboard. Checked against Stripe before the row is written."
                mono
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="price_1AbCdEfGhIjKlMnO"
                value={state.providerPriceId}
                onChangeText={(text) => update({ providerPriceId: text })}
              />
            ) : null}

            <View style={styles.prefilled}>
              <Text style={styles.prefilledTitle}>Prefilled from the ladder</Text>
              <Text style={styles.prefilledLine}>
                {state.label} · generation {state.generation} · rank {state.rank} ·{' '}
                {state.isCustom ? 'no list price' : `${formatPrice(Number(state.priceCents))}/seat`}
              </Text>
              <Text style={styles.prefilledLine}>
                {formatCores(Number(state.maxCores))} cores ·{' '}
                {formatMemory(Number(state.maxMemoryBytes))}
              </Text>
              <Text style={styles.prefilledLine}>
                {formatSlots({
                  nicSlots: Number(state.nicSlots),
                  driveSlots: Number(state.driveSlots),
                  gpuSlots: Number(state.gpuSlots),
                  filesystemSlots: Number(state.filesystemSlots),
                })}
              </Text>
            </View>

            {problems.length > 0 ? (
              <View style={styles.problems}>
                {problems.map((problem) => (
                  <Text key={problem} style={styles.problemText}>
                    • {problem}
                  </Text>
                ))}
              </View>
            ) : null}

            <ButtonRow>
              <Button
                label="Verify and add"
                busyLabel="Checking with Stripe…"
                variant="primary"
                busy={create.isPending}
                disabled={problems.length > 0}
                onPress={submit}
              />
              <Button
                label="Cancel"
                onPress={() => {
                  setSelectedLabel(null)
                  setState(emptyFormState(generation))
                }}
              />
            </ButtonRow>
          </>
        ) : null}

        {create.actionError ? (
          <Text style={styles.errorText}>{create.actionError}</Text>
        ) : null}
        {saved ? <Text style={styles.savedText}>{saved}</Text> : null}
        {warnings.length > 0 ? (
          <View style={styles.warnings}>
            <Text style={styles.warningsTitle}>Saved, with warnings</Text>
            {warnings.map((warning) => (
              <Text key={warning} style={styles.warningText}>
                • {warning}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </SectionPanel>
  )
}

/**
 * Admin → Tiers. The catalogue is hand-entered: nothing seeds it, and the
 * server verifies each row's Stripe price before writing it.
 */
export function TiersSection() {
  const { session } = useAuth()
  const isSuperadmin = isSuperadminSession(session)

  const tiersQuery = useAdminTiers({ enabled: isSuperadmin })
  const defaultsQuery = useAdminTierDefaults({ enabled: isSuperadmin })
  const verifyOne = useVerifyAdminTier()
  const verifyAll = useVerifyAllAdminTiers()
  const deactivate = useDeactivateAdminTier()
  const patch = usePatchAdminTier()

  const [verifications, setVerifications] = useState<Record<string, AdminTierVerification>>({})
  const [verifyingId, setVerifyingId] = useState<string | null>(null)

  const tiers = useMemo(() => sortTiers(tiersQuery.data?.tiers ?? []), [tiersQuery.data])
  const generation = currentGeneration(tiers)

  if (!isSuperadmin) {
    return (
      <SectionPanel title="Tiers">
        <InlineNotice
          title="Superadmin only"
          body="The billing tier catalogue is managed by the instance owner."
        />
      </SectionPanel>
    )
  }

  const runVerifyOne = async (id: string) => {
    setVerifyingId(id)
    const result = await verifyOne.run(id)
    setVerifyingId(null)
    if (result.ok) {
      setVerifications((prev) => ({ ...prev, [id]: result.value.verification }))
    }
  }

  const runVerifyAll = async () => {
    const result = await verifyAll.run()
    if (!result.ok) return
    const next: Record<string, AdminTierVerification> = {}
    for (const entry of result.value.results) {
      next[entry.id] = { ok: entry.ok, failures: entry.failures, price: entry.price }
    }
    setVerifications(next)
  }

  const failing = Object.values(verifications).filter((entry) => !entry.ok).length

  return (
    <View style={styles.container}>
      <SectionPanel
        title="Tier catalogue"
        hint="Entered by hand and verified against Stripe. Nothing seeds these rows."
        headerRight={
          <Button
            label="Verify all"
            size="sm"
            busy={verifyAll.isPending}
            busyLabel="Verifying…"
            onPress={runVerifyAll}
          />
        }
      >
        <View style={styles.panelBody}>
          <HowItWorks />

          {verifyAll.actionError ? (
            <Text style={styles.errorText}>{verifyAll.actionError}</Text>
          ) : null}
          {failing > 0 ? (
            <InlineNotice
              tone="warning"
              title={`${failing} tier${failing === 1 ? '' : 's'} did not verify`}
              body="A row whose price no longer matches will lose entitlement silently — the projection skips items whose price maps to no tier. Fix the price in Stripe, or point the row at the right id."
            />
          ) : null}

          <DataTable columns={COLUMNS} minWidth={940} bordered>
            {tiers.length === 0 ? (
              <DataTableEmpty>
                {tiersQuery.isLoading
                  ? 'Loading…'
                  : 'No tiers yet. Create the Products and Prices in Stripe, then add them below.'}
              </DataTableEmpty>
            ) : (
              tiers.map((tier) => (
                <TierRow
                  key={tier.id}
                  tier={tier}
                  verification={verifications[tier.id]}
                  busy={verifyingId === tier.id}
                  stateBusy={deactivate.isPending || patch.isPending}
                  onVerify={() => runVerifyOne(tier.id)}
                  onDeactivate={() => deactivate.run({ id: tier.id })}
                  onReactivate={() => patch.run({ id: tier.id, body: { isActive: true } })}
                />
              ))
            )}
          </DataTable>

          {deactivate.actionError ? (
            <Text style={styles.errorText}>{deactivate.actionError}</Text>
          ) : null}
          {patch.actionError ? (
            <Text style={styles.errorText}>{patch.actionError}</Text>
          ) : null}
        </View>
      </SectionPanel>

      <AddTierForm defaults={defaultsQuery.data} tiers={tiers} generation={generation} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  panelBody: { gap: spacing.md },
  formBody: { gap: spacing.md },
  tierLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  cellText: { color: colors.text, fontSize: 13 },
  subLine: { color: colors.textDim, fontSize: 11 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  recipe: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.xs,
  },
  recipeTitle: { color: colors.text, fontSize: 13, fontWeight: '600', marginBottom: spacing.xs },
  recipeRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  recipeLabel: { color: colors.textDim, fontSize: 12 },
  recipeValue: { color: colors.text, fontSize: 12, textAlign: 'right', flexShrink: 1 },
  recipeLine: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  prefilled: {
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: spacing.md,
    gap: 2,
  },
  prefilledTitle: { color: colors.textDim, fontSize: 11, textTransform: 'uppercase' },
  prefilledLine: { color: colors.text, fontSize: 12 },
  problems: { gap: 2 },
  problemText: { color: colors.errorText, fontSize: 12 },
  errorText: { color: colors.errorText, fontSize: 13 },
  savedText: { color: colors.green, fontSize: 13 },
  warnings: { gap: 2 },
  warningsTitle: { color: colors.text, fontSize: 12, fontWeight: '600' },
  warningText: { color: colors.pending, fontSize: 12 },
  verifyOk: { marginTop: spacing.xs },
  verifyOkText: { color: colors.green, fontSize: 11 },
  verifyBad: { marginTop: spacing.xs, gap: 2 },
  verifyBadText: { color: colors.errorText, fontSize: 11 },
})
