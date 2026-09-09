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
} from '@/components/ui'
import { isSuperadminSession, useAuth } from '@/lib/auth-context'
import type {
  AdminTier,
  AdminTierProduct,
  AdminTierTaxDefaults,
  AdminTierVerification,
} from '@/lib/instance-api'
import {
  useAdminTierProducts,
  useAdminTiers,
  useCreateAdminTier,
  useDeactivateAdminTier,
  usePatchAdminTier,
  useVerifyAdminTier,
  useVerifyAllAdminTiers,
} from '@/lib/queries/admin'
import {
  failingCount,
  formatCores,
  formatMemory,
  formatPrice,
  formatSlots,
  hasPendingBinding,
  initialProductId,
  ladderRows,
  productOptions,
  referenceSummary,
  verificationsById,
  verifyBadge,
  type LadderRow as LadderRowModel,
} from '@/lib/tier-form'
import { colors, spacing } from '@/lib/theme'

const COLUMNS = [
  { key: 'tier', header: 'Tier', flex: 0.7, minWidth: 80 },
  { key: 'fits', header: 'Fits', flex: 1, minWidth: 120 },
  { key: 'slots', header: 'Slots', flex: 1.4, minWidth: 170 },
  { key: 'price', header: 'Price', flex: 1, minWidth: 120 },
  { key: 'product', header: 'Provider product', flex: 2.6, minWidth: 300 },
  { key: 'used', header: 'In use', flex: 1.1, minWidth: 140 },
  { key: 'state', header: 'State', flex: 1, minWidth: 130 },
] as const

const [C_TIER, C_FITS, C_SLOTS, C_PRICE, C_PRODUCT, C_USED, C_STATE] = COLUMNS

type Verifications = Readonly<Record<string, AdminTierVerification>>

/**
 * The flow, spelled out because it spans two products: the product and its
 * price live in the provider's dashboard; this screen only says which
 * product each ladder label bills against.
 */
function HowItWorks() {
  return (
    <InlineNotice
      title="Pick the provider product for each tier"
      body={
        'Entitlements and list prices come from the shipped ladder and cannot be edited here. ' +
        'For each priced tier, choose the product it bills against — the price comes from the ' +
        "product's default price and is checked before the row is saved. SX is negotiated per " +
        'customer and has no product.'
      }
    />
  )
}

/** `Verified — TurboPanel S3 · live mode`; just `Verified` when the product was not echoed back. */
function verifiedLine(product: AdminTierProduct | null): string {
  if (!product) return 'Verified'
  const mode = product.livemode ? 'live mode' : 'test mode'
  return `Verified — ${product.name} · ${mode}`
}

function VerificationDetail({
  verification,
}: Readonly<{ verification: AdminTierVerification | undefined }>) {
  if (!verification) return null
  if (verification.ok) {
    return <Text style={styles.verifyOkText}>{verifiedLine(verification.product)}</Text>
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

/** Save = POST for a label with no row yet, PATCH for an existing one. */
function useBindProduct(row: LadderRowModel, onVerified: (verification: AdminTierVerification | null) => void) {
  const create = useCreateAdminTier()
  const patch = usePatchAdminTier()
  const [saved, setSaved] = useState<string | null>(null)

  const save = async (productId: string | null) => {
    setSaved(null)
    const outcome = row.tier
      ? await patch.run({ id: row.tier.id, body: { providerProductId: productId } })
      : await create.run({
          label: row.entry.label,
          ...(row.entry.isCustom ? {} : { providerProductId: productId }),
        })
    if (!outcome.ok) return
    onVerified(outcome.value.verification)
    setSaved(row.tier ? 'Saved' : `${row.entry.label} set up`)
  }

  return {
    save,
    saved,
    busy: create.isPending || patch.isPending,
    error: create.actionError ?? patch.actionError,
  }
}

/** Save outcome under a product cell: the error, or the confirmation. */
function BindingStatus({ error, saved }: Readonly<{ error: string | null; saved: string | null }>) {
  return (
    <>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {saved ? <Text style={styles.savedText}>{saved}</Text> : null}
    </>
  )
}

/** SX takes no product; the only action is creating its row once. */
function CustomProductCell({
  row,
  onVerified,
}: Readonly<{
  row: LadderRowModel
  onVerified: (verification: AdminTierVerification | null) => void
}>) {
  const binding = useBindProduct(row, onVerified)
  return (
    <View style={styles.productCell}>
      <Text style={styles.cellText}>Negotiated</Text>
      <Text style={styles.subLine}>No product — priced per customer</Text>
      {row.tier ? null : (
        <ButtonRow>
          <Button
            label="Set up"
            size="sm"
            busy={binding.busy}
            onPress={() => {
              void binding.save(null)
            }}
          />
        </ButtonRow>
      )}
      <BindingStatus error={binding.error} saved={binding.saved} />
    </View>
  )
}

/** The one editable thing on a priced row: which product it bills against. */
function ProductCell({
  row,
  products,
  productsUnavailable,
  verification,
  verifying,
  onVerify,
  onVerified,
}: Readonly<{
  row: LadderRowModel
  products: readonly AdminTierProduct[]
  productsUnavailable: boolean
  verification: AdminTierVerification | undefined
  verifying: boolean
  onVerify: () => void
  onVerified: (verification: AdminTierVerification | null) => void
}>) {
  const binding = useBindProduct(row, onVerified)
  const [productId, setProductId] = useState<string | null>(() => initialProductId(row, products))
  const options = useMemo(() => productOptions(products, row.tier?.id ?? null), [products, row.tier?.id])
  const badge = verifyBadge(row.tier, verification, verifying || binding.busy)
  const pending = hasPendingBinding(row, productId)
  const noProducts = options.length === 0
  const canVerify = row.tier?.providerProductId != null && !pending
  // `/tiers/products` lists active products only, so a row bound to a
  // since-archived product would otherwise show an empty dropdown.
  const boundId = row.tier?.providerProductId ?? null
  const boundUnlisted = boundId !== null && !options.some((option) => option.value === boundId)

  return (
    <View style={styles.productCell}>
      {productsUnavailable ? (
        <MonoText style={styles.cellText}>{row.tier?.providerProductId ?? '—'}</MonoText>
      ) : (
        <Select
          value={productId}
          options={options}
          placeholder={noProducts ? 'No products on the provider' : 'Choose a product'}
          disabled={binding.busy || noProducts}
          accessibilityLabel={`Provider product for ${row.entry.label}`}
          onChange={setProductId}
        />
      )}
      {boundUnlisted && !productsUnavailable ? (
        <Text style={styles.subLine}>
          Bound to <MonoText style={styles.subLine}>{boundId}</MonoText>, which the provider no longer lists
        </Text>
      ) : null}
      <View style={styles.badgeRow}>
        <Badge label={badge.label} tone={badge.tone} />
        {pending ? (
          <Button
            label={row.tier ? 'Save' : 'Verify and save'}
            size="sm"
            variant="primary"
            busy={binding.busy}
            busyLabel="Checking…"
            onPress={() => {
              void binding.save(productId)
            }}
          />
        ) : null}
        {canVerify ? <Button label="Verify" size="sm" onPress={onVerify} busy={verifying} /> : null}
      </View>
      <VerificationDetail verification={verification} />
      <BindingStatus error={binding.error} saved={binding.saved} />
    </View>
  )
}

/** Ladder list price beside what the provider's product actually carries. */
function PriceCell({ row }: Readonly<{ row: LadderRowModel }>) {
  const list = formatPrice(row.entry.listPriceCents)
  const cached = row.tier?.priceCents ?? null
  if (row.entry.isCustom) {
    return <Text style={styles.cellText}>—</Text>
  }
  return (
    <>
      <Text style={styles.cellText}>{cached === null ? list : formatPrice(cached, row.tier?.currency)}</Text>
      <Text style={styles.subLine}>
        {cached === null ? 'list price · not verified yet' : `/ license / month · list ${list}`}
      </Text>
    </>
  )
}

function StateCell({
  tier,
  busy,
  onDeactivate,
  onReactivate,
}: Readonly<{
  tier: AdminTier | null
  busy: boolean
  onDeactivate: () => void
  onReactivate: () => void
}>) {
  if (!tier) return <Badge label="Not set up" tone="muted" />
  return (
    <>
      <Badge label={tier.isActive ? 'Active' : 'Retired'} tone={tier.isActive ? 'ok' : 'muted'} />
      <View style={styles.badgeRow}>
        {tier.isActive ? (
          <ConfirmButton
            label="Retire"
            confirmLabel="Retire it"
            prompt={`Stop selling ${tier.label}?`}
            busy={busy}
            onConfirm={onDeactivate}
          />
        ) : (
          // Retiring is reversible on purpose: the row is never deleted,
          // so a misclick is one press back rather than a database trip.
          <Button label="Reactivate" size="sm" busy={busy} onPress={onReactivate} />
        )}
      </View>
    </>
  )
}

function LadderRow({
  row,
  products,
  productsUnavailable,
  verification,
  verifying,
  stateBusy,
  onVerify,
  onVerified,
  onDeactivate,
  onReactivate,
}: Readonly<{
  row: LadderRowModel
  products: readonly AdminTierProduct[]
  productsUnavailable: boolean
  verification: AdminTierVerification | undefined
  verifying: boolean
  stateBusy: boolean
  onVerify: (tierId: string) => void
  onVerified: (tierId: string, verification: AdminTierVerification | null) => void
  onDeactivate: (tierId: string) => void
  onReactivate: (tierId: string) => void
}>) {
  const { entry, tier } = row
  /** Runs `action` for the row's tier — a label with no row yet has nothing to act on. */
  const withTier = (action: (tierId: string) => void) => () => {
    if (tier) action(tier.id)
  }
  const verified = (verification: AdminTierVerification | null) => {
    if (tier) onVerified(tier.id, verification)
  }
  return (
    <DataTableRow>
      <DataTableCell column={C_TIER}>
        <Text style={styles.tierLabel}>{entry.label}</Text>
        <Text style={styles.subLine}>rank {entry.rank}{entry.isCustom ? ' · custom' : ''}</Text>
      </DataTableCell>
      <DataTableCell column={C_FITS}>
        <Text style={styles.cellText}>{formatCores(entry.entitlements.maxCores)} cores</Text>
        <Text style={styles.subLine}>{formatMemory(entry.entitlements.maxMemoryBytes)}</Text>
      </DataTableCell>
      <DataTableCell column={C_SLOTS}>
        <Text style={styles.cellText}>{formatSlots(entry.entitlements)}</Text>
      </DataTableCell>
      <DataTableCell column={C_PRICE}>
        <PriceCell row={row} />
      </DataTableCell>
      <DataTableCell column={C_PRODUCT}>
        {entry.isCustom ? (
          <CustomProductCell row={row} onVerified={verified} />
        ) : (
          <ProductCell
            row={row}
            products={products}
            productsUnavailable={productsUnavailable}
            verification={verification}
            verifying={verifying}
            onVerify={withTier(onVerify)}
            onVerified={verified}
          />
        )}
      </DataTableCell>
      <DataTableCell column={C_USED}>
        <Text style={styles.cellText}>{tier ? referenceSummary(tier) : '—'}</Text>
      </DataTableCell>
      <DataTableCell column={C_STATE}>
        <StateCell
          tier={tier}
          busy={stateBusy}
          onDeactivate={withTier(onDeactivate)}
          onReactivate={withTier(onReactivate)}
        />
      </DataTableCell>
    </DataTableRow>
  )
}

/** Per-row verification results this page has collected, from Verify, Verify all, and saves. */
function useVerifications() {
  const verifyOne = useVerifyAdminTier()
  const verifyAll = useVerifyAllAdminTiers()
  const [verifications, setVerifications] = useState<Verifications>({})
  const [verifyingId, setVerifyingId] = useState<string | null>(null)

  const record = (id: string, verification: AdminTierVerification | null) => {
    if (!verification) return
    setVerifications((prev) => ({ ...prev, [id]: verification }))
  }

  const runVerifyOne = async (id: string) => {
    setVerifyingId(id)
    const result = await verifyOne.run(id)
    setVerifyingId(null)
    if (result.ok) {
      record(id, result.value.verification)
    } else if (result.error) {
      // A 400 from verify is itself the verdict: the product no longer passes.
      record(id, { ok: false, failures: [result.error], product: null })
    }
  }

  const runVerifyAll = async () => {
    const result = await verifyAll.run()
    if (result.ok) setVerifications(verificationsById(result.value.results))
  }

  return {
    verifications,
    verifyingId,
    record,
    runVerifyOne,
    runVerifyAll,
    verifyingAll: verifyAll.isPending,
    verifyAllError: verifyAll.actionError,
  }
}

function ProductsUnavailableNotice({
  error,
  onRetry,
}: Readonly<{ error: unknown; onRetry: () => void }>) {
  const detail = error instanceof Error ? error.message : 'Unknown error'
  return (
    <InlineNotice
      tone="warning"
      title="Could not list the provider's products"
      body={`The dropdowns are unavailable until the provider answers. Existing bindings still show by id. ${detail}`}
      actions={<Button label="Retry" size="sm" onPress={onRetry} />}
    />
  )
}

/**
 * What the payment account's tax default is, and what it means for a price
 * that leaves its own tax behaviour unset.
 *
 * Without this the operator has no way to tell, from the panel, why a price
 * the Stripe Dashboard labels "Use default" passes verification — or why it
 * does not.
 */
function TaxDefaultNotice({ taxDefaults }: Readonly<{ taxDefaults: AdminTierTaxDefaults | null }>) {
  if (!taxDefaults) return null
  const behaviour = taxDefaults.taxBehavior
  if (behaviour === 'inclusive' || behaviour === 'exclusive') {
    return (
      <InlineNotice
        tone="info"
        title={`Prices are tax ${behaviour} by default`}
        body={`Set on the payment account, so a price that does not name its own tax behaviour uses this. Those prices verify normally. Change it on the provider, under tax settings.`}
      />
    )
  }
  return (
    <InlineNotice
      tone="warning"
      title="No default tax behaviour on the account"
      body="Every price must then name its own, or it will not verify. Setting a default on the provider's tax settings covers all of them at once and is the recommended setup."
    />
  )
}

function FailingNotice({ count }: Readonly<{ count: number }>) {
  if (count === 0) return null
  return (
    <InlineNotice
      tone="warning"
      title={`${count} tier${count === 1 ? '' : 's'} did not verify`}
      body="A row whose product no longer passes loses entitlement silently — the projection skips items whose product maps to no tier. Fix the product on the provider, or point the row at another one."
    />
  )
}

function ErrorLine({ error }: Readonly<{ error: unknown }>) {
  if (!error) return null
  const text = error instanceof Error ? error.message : String(error)
  return <Text style={styles.errorText}>{text}</Text>
}

function LadderTable({
  rows,
  loading,
  products,
  productsUnavailable,
  checks,
  stateBusy,
  onDeactivate,
  onReactivate,
}: Readonly<{
  rows: readonly LadderRowModel[]
  loading: boolean
  products: readonly AdminTierProduct[]
  productsUnavailable: boolean
  checks: ReturnType<typeof useVerifications>
  stateBusy: boolean
  onDeactivate: (tierId: string) => void
  onReactivate: (tierId: string) => void
}>) {
  if (rows.length === 0) {
    return (
      <DataTable columns={COLUMNS} minWidth={1060} bordered>
        <DataTableEmpty>{loading ? 'Loading…' : 'The ladder is empty.'}</DataTableEmpty>
      </DataTable>
    )
  }
  return (
    <DataTable columns={COLUMNS} minWidth={1060} bordered>
      {rows.map((row) => (
        <LadderRow
          // Remount when the binding or the product list changes so the
          // dropdown re-seeds from the row instead of a stale pick.
          key={`${row.entry.label}:${row.tier?.providerProductId ?? ''}:${products.length}`}
          row={row}
          products={products}
          productsUnavailable={productsUnavailable}
          verification={row.tier ? checks.verifications[row.tier.id] : undefined}
          verifying={row.tier?.id === checks.verifyingId}
          stateBusy={stateBusy}
          onVerify={(tierId) => {
            void checks.runVerifyOne(tierId)
          }}
          onVerified={checks.record}
          onDeactivate={onDeactivate}
          onReactivate={onReactivate}
        />
      ))}
    </DataTable>
  )
}

/**
 * Admin → Tiers. One row per ladder label; the operator picks the provider
 * product each priced label bills against. The server verifies the product
 * before writing and caches its price on the row.
 */
export function TiersSection() {
  const { session } = useAuth()
  const isSuperadmin = isSuperadminSession(session)

  const tiersQuery = useAdminTiers({ enabled: isSuperadmin })
  const productsQuery = useAdminTierProducts({ enabled: isSuperadmin })
  const deactivate = useDeactivateAdminTier()
  const patch = usePatchAdminTier()
  const checks = useVerifications()

  const rows = useMemo(
    () => ladderRows(tiersQuery.data?.ladder ?? [], tiersQuery.data?.tiers ?? []),
    [tiersQuery.data]
  )
  const products = useMemo(() => productsQuery.data?.products ?? [], [productsQuery.data])

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

  return (
    <View style={styles.container}>
      <SectionPanel
        title="Tier catalogue"
        hint="One row per ladder label. Entitlements are read-only; the price comes from the product."
        headerRight={
          <Button
            label="Verify all"
            size="sm"
            busy={checks.verifyingAll}
            busyLabel="Verifying…"
            onPress={() => {
              void checks.runVerifyAll()
            }}
          />
        }
      >
        <View style={styles.panelBody}>
          <HowItWorks />

          {productsQuery.isError ? (
            <ProductsUnavailableNotice
              error={productsQuery.error}
              onRetry={() => {
                void productsQuery.refetch()
              }}
            />
          ) : null}
          <TaxDefaultNotice taxDefaults={productsQuery.data?.taxDefaults ?? null} />
          <ErrorLine error={tiersQuery.error} />
          <ErrorLine error={checks.verifyAllError} />
          <FailingNotice count={failingCount(checks.verifications)} />

          <LadderTable
            rows={rows}
            loading={tiersQuery.isLoading}
            products={products}
            productsUnavailable={productsQuery.isError}
            checks={checks}
            stateBusy={deactivate.isPending || patch.isPending}
            onDeactivate={(id) => {
              void deactivate.run({ id })
            }}
            onReactivate={(id) => {
              void patch.run({ id, body: { isActive: true } })
            }}
          />

          <ErrorLine error={deactivate.actionError} />
          <ErrorLine error={patch.actionError} />
        </View>
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  panelBody: { gap: spacing.md },
  tierLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  cellText: { color: colors.text, fontSize: 13 },
  subLine: { color: colors.textDim, fontSize: 11 },
  productCell: { gap: spacing.xs },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  errorText: { color: colors.errorText, fontSize: 12 },
  savedText: { color: colors.green, fontSize: 12 },
  verifyOkText: { color: colors.green, fontSize: 11 },
  verifyBad: { gap: 2 },
  verifyBadText: { color: colors.errorText, fontSize: 11 },
})
