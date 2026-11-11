import { useState } from 'react'
import { Text, View } from 'react-native'
import { MonoText, TextField } from '@/components/ui'
import { ActionButton } from '@/components/ui/v4/action-button'
import { ChoiceCard, ChoiceGroup } from '@/components/ui/v4/choice-card'
import { Sheet } from '@/components/ui/v4/sheet'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import type { CacheRecord } from '@/lib/instance-api'
import { useCreateCache, useUpdateCache } from '@/lib/queries/caches'
import { failedRunMessage } from '@/lib/user-error'
import {
  CACHE_ACCESS_CHOICES,
  CACHE_ENGINE_LABEL,
  CACHE_VARIABLES_NOTE,
  cacheFormError,
  cacheFormFor,
  cacheMemoryHint,
  cacheVariablePreview,
  createCacheBody,
  emptyCacheForm,
  updateCacheBody,
  validateCacheMemory,
  validateCachePrefix,
  type CacheForm,
} from '@/lib/v4/project-caches'

const styles = themedStyles((p) => ({
  section: { gap: 8 },
  label: { ...typeStyle('bodySemibold', 'subhead'), color: p.text },
  hint: { ...typeStyle('body', 'footnote'), color: p.text3 },
  value: { ...typeStyle('body', 'body'), color: p.text },
  names: { gap: 4 },
  name: { color: p.text2 },
  error: { ...typeStyle('body', 'footnote'), color: p.bad },
}))

type Account = Readonly<{ id: string; name: string }>

const NO_ACCOUNT_NOTE =
  'Add a site or app to this environment first. A cache runs as the Hosting Account of one.'

function ReadOnlyLine({ label, value }: Readonly<{ label: string; value: string }>) {
  const s = styles(usePalette())
  return (
    <View style={s.section}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  )
}

function AccountChoices({
  accounts,
  loading,
  value,
  onChange,
}: Readonly<{
  accounts: readonly Account[]
  loading: boolean
  value: string | null
  onChange: (id: string) => void
}>) {
  const s = styles(usePalette())
  return (
    <View style={s.section}>
      <Text style={s.label}>Hosting Account</Text>
      {accounts.length === 0 ? (
        <Text style={s.hint}>{loading ? 'Loading Hosting Accounts…' : NO_ACCOUNT_NOTE}</Text>
      ) : (
        <ChoiceGroup label="Hosting Account">
          {accounts.map((account) => (
            <ChoiceCard
              key={account.id}
              title={account.name}
              selected={value === account.id}
              onSelect={() => onChange(account.id)}
            />
          ))}
        </ChoiceGroup>
      )}
    </View>
  )
}

function AccessChoices({
  value,
  onChange,
}: Readonly<{ value: CacheForm['access']; onChange: (access: CacheForm['access']) => void }>) {
  const s = styles(usePalette())
  return (
    <View style={s.section}>
      <Text style={s.label}>Access</Text>
      <ChoiceGroup label="Access">
        {CACHE_ACCESS_CHOICES.map((choice) => (
          <ChoiceCard
            key={choice.value}
            title={choice.title}
            body={choice.body}
            selected={value === choice.value}
            onSelect={() => onChange(choice.value)}
          />
        ))}
      </ChoiceGroup>
    </View>
  )
}

function PrefixPreview({ form }: Readonly<{ form: CacheForm }>) {
  const s = styles(usePalette())
  const names = cacheVariablePreview(form.prefix.trim(), form.access)
  if (names.length === 0) return null
  return (
    <View style={s.names} accessibilityLabel="Variable names">
      {names.map((name) => (
        <MonoText key={name} style={s.name}>
          {name}
        </MonoText>
      ))}
    </View>
  )
}

/**
 * Add or change a cache. The engine reads "Valkey 8.1" and cannot be chosen:
 * there is one, and no preset. Changing keeps the name and Hosting Account (the
 * control plane cannot change them) and sends only what differs.
 */
export function CacheSheet({
  orgId,
  environmentId,
  visible,
  cache,
  accounts,
  accountsLoading = false,
  onClose,
}: Readonly<{
  orgId: string
  environmentId: string
  visible: boolean
  /** The cache being changed; null adds a new one. */
  cache: CacheRecord | null
  accounts: readonly Account[]
  accountsLoading?: boolean
  onClose: () => void
}>) {
  const s = styles(usePalette())
  const create = useCreateCache(orgId, environmentId)
  const update = useUpdateCache(orgId, environmentId)
  const adding = cache === null
  const [form, setForm] = useState<CacheForm>(() =>
    cache === null ? emptyCacheForm(accounts[0]?.id ?? null) : cacheFormFor(cache)
  )
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const pending = create.isPending || update.isPending

  const change = (next: Partial<CacheForm>) => {
    setForm((current) => ({ ...current, ...next }))
    setError(null)
  }

  const save = async () => {
    if (cache === null) {
      const body = createCacheBody(form)
      return body === null ? null : await create.run(body)
    }
    const body = updateCacheBody(cache, form)
    return body === null ? null : await update.run({ cacheId: cache.id, body })
  }

  const submit = async () => {
    if (pending) return
    setTouched(true)
    const problem = cacheFormError(form, adding)
    if (problem !== null) {
      setError(problem)
      return
    }
    const result = await save()
    if (result?.ok === false) {
      setError(
        failedRunMessage(
          result,
          adding ? 'Could not add the cache.' : 'Could not change the cache.'
        )
      )
      return
    }
    onClose()
  }

  const memoryError = touched ? validateCacheMemory(form.memory) : null
  const prefixError = touched ? validateCachePrefix(form.prefix.trim()) : null
  const unchanged = !adding && cache !== null && updateCacheBody(cache, form) === null
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={adding ? 'Add Cache' : `Edit ${cache.name}`}
      why={adding ? undefined : 'A new limit or access restarts the cache.'}
      footer={
        <>
          <ActionButton label="Cancel" variant="quiet" onPress={onClose} />
          <ActionButton
            label={adding ? 'Add Cache' : 'Save'}
            variant="primary"
            busy={pending}
            busyLabel={adding ? 'Adding…' : 'Saving…'}
            disabled={unchanged}
            onPress={() => {
              submit().catch(() => setError('Could not save the cache.'))
            }}
          />
        </>
      }
    >
      <ReadOnlyLine label="Engine" value={CACHE_ENGINE_LABEL} />
      {adding ? (
        <>
          <TextField
            label="Name"
            value={form.name}
            onChangeText={(name) => change({ name })}
            placeholder="e.g. sessions"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!pending}
            maxLength={63}
            accessibilityLabel="Cache name"
          />
          <AccountChoices
            accounts={accounts}
            loading={accountsLoading}
            value={form.principalId}
            onChange={(principalId) => change({ principalId })}
          />
        </>
      ) : (
        <>
          <ReadOnlyLine label="Name" value={form.name} />
          <ReadOnlyLine label="Hosting Account" value={cache.hostingAccount} />
        </>
      )}
      <AccessChoices value={form.access} onChange={(access) => change({ access })} />
      <TextField
        label="Memory Limit (MiB)"
        value={form.memory}
        onChangeText={(memory) => change({ memory })}
        keyboardType="number-pad"
        editable={!pending}
        hint={cacheMemoryHint()}
        error={memoryError}
        accessibilityLabel="Memory limit in MiB"
      />
      <TextField
        label="Variable Prefix"
        value={form.prefix}
        onChangeText={(prefix) => change({ prefix })}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!pending}
        error={prefixError}
        accessibilityLabel="Variable prefix"
      />
      <PrefixPreview form={form} />
      <Text style={s.hint}>{CACHE_VARIABLES_NOTE}</Text>
      {error === null ? null : <Text style={s.error}>{error}</Text>}
    </Sheet>
  )
}
