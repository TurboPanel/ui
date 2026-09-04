import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button, ConfirmButton, MonoText, Select, TextField } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  DEFAULT_PRINCIPAL_ACCESS,
  PRINCIPAL_ACCESS_VALUES,
  principalAccessOf,
  type PrincipalAccess,
  type PrincipalSpec,
} from '@/lib/compose/root-extension'
import { isPrincipalAlias } from '@/lib/compose/service-kind'
import { colors, spacing } from '@/lib/theme'

/**
 * What each access level actually grants, said in the picker rather than in a
 * doc nobody opens. `none` is the default and is a real choice, not an absence:
 * an account that exists so files can belong to it, with no way to log in.
 */
const ACCESS_LABELS: Readonly<Record<PrincipalAccess, string>> = {
  none: 'No login — the account exists so files can belong to it',
  sftp: 'Files only — SFTP, no shell',
  ssh: 'Shell — SSH and SFTP',
}

const ACCESS_OPTIONS = PRINCIPAL_ACCESS_VALUES.map((value) => ({
  value,
  label: ACCESS_LABELS[value],
}))

const ALIAS_RULE =
  'An alias starts with a letter and uses letters, digits, “-”, and “_” (at most 64 characters).'

/**
 * The document's accounts — the root `x-turbopanel.principals` block.
 *
 * Declared here and *referenced* per service, rather than written inline on the
 * service, because one account routinely owns several services (a site and the
 * worker that shares its files) and inline copies would be several answers to
 * one question. A service points at an alias; this is where the alias exists.
 *
 * An alias is a document-local name, never the Linux username: the panel
 * derives the host account from it, and everything that decides what that
 * account *is* — uid, home, shell, keys — lives on the principal record under
 * organization rights, not in YAML anyone with compose access can edit. The
 * access level here is a **request** the panel resolves; changing it later in
 * the principal's own screen is what actually moves the account.
 */
export function ComposePrincipalsFields({
  principals,
  disabled,
  onChange,
  onRename,
}: Readonly<{
  principals: Readonly<Record<string, PrincipalSpec>>
  disabled: boolean
  /** Replaces the whole map — an empty one removes the block. */
  onChange: (next: Record<string, PrincipalSpec>) => void
  /**
   * Rename an alias, including every service that references it. The caller
   * owns the document walk (`renameComposePrincipal`); this only collects a
   * valid, collision-free name.
   */
  onRename?: (from: string, to: string) => void
}>) {
  const [alias, setAlias] = useState('')
  const [error, setError] = useState<string | null>(null)
  /** Alias whose row is showing the rename field, and the draft typed so far. */
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const entries = Object.entries(principals)

  const handleAdd = () => {
    const trimmed = alias.trim()
    if (!isPrincipalAlias(trimmed)) {
      setError(ALIAS_RULE)
      return
    }
    if (Object.hasOwn(principals, trimmed)) {
      setError(`There is already an account called “${trimmed}”.`)
      return
    }
    setError(null)
    setAlias('')
    onChange({ ...principals, [trimmed]: {} })
  }

  const startRename = (name: string) => {
    setRenaming(name)
    setRenameDraft(name)
    setRenameError(null)
  }

  const cancelRename = () => {
    setRenaming(null)
    setRenameDraft('')
    setRenameError(null)
  }

  const commitRename = (from: string) => {
    const trimmed = renameDraft.trim()
    if (trimmed === from) {
      cancelRename()
      return
    }
    if (!isPrincipalAlias(trimmed)) {
      setRenameError(ALIAS_RULE)
      return
    }
    if (Object.hasOwn(principals, trimmed)) {
      setRenameError(`There is already an account called “${trimmed}”.`)
      return
    }
    cancelRename()
    onRename?.(from, trimmed)
  }

  const setAccess = (name: string, access: PrincipalAccess) => {
    const spec = principals[name] ?? {}
    onChange({
      ...principals,
      [name]: access === DEFAULT_PRINCIPAL_ACCESS
        ? // Omitting the key *is* `none`, so writing it would be noise.
          (({ access: _default, ...rest }) => rest)(spec)
        : { ...spec, access },
    })
  }

  const remove = (name: string) => {
    const { [name]: _removed, ...rest } = principals
    onChange(rest)
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.detailLabel}>Accounts</Text>
      <Text style={panelStyles.muted}>
        Sites and Node apps run as an account. Declare one here, then pick it on
        the service. The name is local to this file — TurboPanel derives the
        real Linux user, and uid, home, shell, and keys stay on the account
        itself.
      </Text>

      {entries.length === 0 ? (
        <Text style={panelStyles.muted}>No accounts declared yet.</Text>
      ) : null}

      {entries.map(([name, spec]) => (
        <View key={name} style={styles.row}>
          <View style={styles.rowText}>
            {renaming === name ? (
              <View style={styles.renameForm}>
                {renameError ? (
                  <Text style={panelStyles.error}>{renameError}</Text>
                ) : null}
                <TextField
                  label={`Rename ${name}`}
                  value={renameDraft}
                  onChangeText={setRenameDraft}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.renameActions}>
                  <Button
                    label="Rename"
                    size="sm"
                    onPress={() => commitRename(name)}
                  />
                  <Button
                    label="Cancel"
                    size="sm"
                    variant="secondary"
                    onPress={cancelRename}
                  />
                </View>
              </View>
            ) : (
              <MonoText style={styles.alias}>{name}</MonoText>
            )}
            {spec.description ? (
              <Text style={panelStyles.muted}>{spec.description}</Text>
            ) : null}
            <Select
              value={principalAccessOf(spec)}
              options={ACCESS_OPTIONS}
              placeholder="Access"
              disabled={disabled}
              accessibilityLabel={`Access for ${name}`}
              onChange={(next) => {
                if (next === null) return
                setAccess(name, next as PrincipalAccess)
              }}
            />
          </View>
          {!disabled ? (
            <View style={styles.rowActions}>
              {onRename && renaming !== name ? (
                <Button
                  label="Rename"
                  size="sm"
                  variant="secondary"
                  onPress={() => startRename(name)}
                />
              ) : null}
              <ConfirmButton
                label="Remove"
                prompt={`Remove ${name}? Services that name it will need another account.`}
                confirmLabel="Remove"
                size="sm"
                onConfirm={() => remove(name)}
              />
            </View>
          ) : null}
        </View>
      ))}

      {!disabled ? (
        <View style={styles.form}>
          {error ? <Text style={panelStyles.error}>{error}</Text> : null}
          <TextField
            label="Alias"
            value={alias}
            onChangeText={setAlias}
            placeholder="app"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button label="Add account" size="sm" onPress={handleAdd} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
  rowActions: {
    gap: spacing.xs,
    alignItems: 'flex-end',
  },
  alias: {
    color: colors.text,
  },
  renameForm: {
    gap: spacing.xs,
  },
  renameActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  form: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
})
