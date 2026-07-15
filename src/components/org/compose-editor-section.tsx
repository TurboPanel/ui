import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  composeDocumentToRuntimeYaml,
  composeDocumentToYaml,
  normalizeCompose,
  preserveComposePlacement,
  stripComposePlacement,
  yamlToComposeDocument,
  type ComposeDocument,
} from '@/lib/compose'
import { colors, spacing } from '@/lib/theme'

type EditorTab = 'user' | 'stored' | 'visual'

function servicesFrom(document: ComposeDocument): Record<string, Record<string, unknown>> {
  const services = document.data.services
  if (typeof services !== 'object' || services === null || Array.isArray(services)) {
    return {}
  }
  const result: Record<string, Record<string, unknown>> = {}
  for (const [name, service] of Object.entries(services)) {
    if (typeof service === 'object' && service !== null && !Array.isArray(service)) {
      result[name] = service
    }
  }
  return result
}

function servicePorts(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join(', ') : ''
}

function editedDocument(
  tab: EditorTab,
  yaml: string,
  draft: ComposeDocument,
): ComposeDocument {
  if (tab === 'user') {
    return yamlToComposeDocument(yaml)
  }
  return draft
}

function storedPreviewDocument(
  tab: EditorTab,
  yaml: string,
  draft: ComposeDocument,
  source: unknown,
): ComposeDocument {
  try {
    return preserveComposePlacement(editedDocument(tab, yaml, draft), source)
  } catch {
    return preserveComposePlacement(draft, source)
  }
}

export function ComposeEditorSection({
  document,
  onSave,
  saving = false,
  title = 'Docker Compose',
}: Readonly<{
  document: unknown
  onSave: (document: ComposeDocument) => Promise<void>
  saving?: boolean
  title?: string
}>) {
  const source = normalizeCompose(document)
  const [tab, setTab] = useState<EditorTab>('user')
  const [draft, setDraft] = useState<ComposeDocument>(() => stripComposePlacement(source))
  const [yaml, setYaml] = useState(() =>
    composeDocumentToYaml(stripComposePlacement(source)),
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const normalized = stripComposePlacement(normalizeCompose(document))
    setDraft(normalized)
    setYaml(composeDocumentToYaml(normalized))
  }, [document])

  const updateDraft = (next: ComposeDocument) => {
    const visible = stripComposePlacement(next)
    setDraft(visible)
    setYaml(composeDocumentToYaml(visible))
    setError(null)
  }

  const resolveStoredPreview = (): ComposeDocument =>
    storedPreviewDocument(tab, yaml, draft, document)

  const handleSave = async () => {
    try {
      const edited = tab === 'user' ? yamlToComposeDocument(yaml) : draft
      const next = preserveComposePlacement(edited, document)
      setError(null)
      await onSave(next)
      updateDraft(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compose YAML is invalid')
    }
  }

  const updateService = (name: string, patch: Record<string, unknown>) => {
    const services = servicesFrom(draft)
    updateDraft({
      ...draft,
      data: {
        ...draft.data,
        services: {
          ...services,
          [name]: { ...services[name], ...patch },
        },
      },
    })
  }

  const renameService = (name: string, nextName: string) => {
    const normalizedName = nextName.trim()
    if (!normalizedName || normalizedName === name) {
      return
    }
    const services = servicesFrom(draft)
    const { [name]: service, ...remaining } = services
    updateDraft({
      ...draft,
      data: {
        ...draft.data,
        services: { ...remaining, [normalizedName]: service ?? {} },
      },
    })
  }

  const removeService = (name: string) => {
    const services = servicesFrom(draft)
    const { [name]: _, ...remaining } = services
    updateDraft({ ...draft, data: { ...draft.data, services: remaining } })
  }

  const addService = () => {
    const services = servicesFrom(draft)
    const baseName = 'service'
    let name = baseName
    let index = 2
    while (services[name]) {
      name = `${baseName}-${index}`
      index += 1
    }
    updateDraft({
      ...draft,
      data: { ...draft.data, services: { ...services, [name]: { image: '' } } },
    })
  }

  const storedPreview = tab === 'stored' ? resolveStoredPreview() : null
  const storedYaml = storedPreview ? composeDocumentToYaml(storedPreview) : ''
  const runtimeYaml = storedPreview ? composeDocumentToRuntimeYaml(storedPreview) : ''

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.tabs}>
          {([
            ['user', 'User'],
            ['stored', 'Stored'],
            ['visual', 'Visual'],
          ] as const).map(([entry, label]) => (
            <Pressable
              key={entry}
              style={[styles.tab, tab === entry && styles.tabActive]}
              onPress={() => {
                if (tab === 'user' && entry !== 'user') {
                  try {
                    const parsed = stripComposePlacement(yamlToComposeDocument(yaml))
                    setDraft(parsed)
                    setYaml(composeDocumentToYaml(parsed))
                    setError(null)
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Compose YAML is invalid')
                    return
                  }
                }
                if (entry === 'user' && tab === 'visual') {
                  setYaml(composeDocumentToYaml(draft))
                }
                setTab(entry)
              }}
            >
              <Text style={[styles.tabText, tab === entry && styles.tabTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {tab === 'user' ? (
        <>
          <Text style={styles.hint}>
            Editable compose — TurboPanel placement (`x-turbopanel`) is hidden here. Comments are kept on save.
          </Text>
          <TextInput
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            value={yaml}
            onChangeText={(value) => {
              setYaml(value)
              setError(null)
            }}
            editable={!saving}
            style={styles.yamlInput}
            textAlignVertical="top"
          />
        </>
      ) : null}

      {tab === 'stored' ? (
        <>
          <Text style={styles.hint}>
            What is stored (including placement). Runtime deploy drops presentation-only comments.
          </Text>
          <Text style={styles.subheading}>Stored</Text>
          <TextInput
            editable={false}
            multiline
            value={storedYaml}
            style={[styles.yamlInput, styles.yamlReadonly]}
            textAlignVertical="top"
          />
          <Text style={styles.subheading}>Runtime (deployed)</Text>
          <TextInput
            editable={false}
            multiline
            value={runtimeYaml}
            style={[styles.yamlInput, styles.yamlReadonly]}
            textAlignVertical="top"
          />
        </>
      ) : null}

      {tab === 'visual' ? (
        <View style={styles.serviceList}>
          {Object.entries(servicesFrom(draft)).map(([name, service]) => (
            <View key={name} style={orgPanelStyles.detailCard}>
              <View style={styles.serviceHeader}>
                <TextInput
                  value={name}
                  onEndEditing={(event) => renameService(name, event.nativeEvent.text)}
                  editable={!saving}
                  style={styles.serviceNameInput}
                />
                <Pressable onPress={() => removeService(name)}>
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
              <Text style={styles.label}>Image</Text>
              <TextInput
                value={typeof service.image === 'string' ? service.image : ''}
                onChangeText={(image) => updateService(name, { image })}
                editable={!saving}
                placeholder="nginx:alpine"
                placeholderTextColor={colors.textDim}
                style={styles.input}
              />
              <Text style={styles.label}>Ports</Text>
              <TextInput
                value={servicePorts(service.ports)}
                onChangeText={(ports) =>
                  updateService(name, {
                    ports: ports.split(',').map((port) => port.trim()).filter(Boolean),
                  })
                }
                editable={!saving}
                placeholder="8080:80, 8443:443"
                placeholderTextColor={colors.textDim}
                style={styles.input}
              />
            </View>
          ))}
          <Pressable style={styles.secondaryButton} onPress={addService} disabled={saving}>
            <Text style={styles.secondaryButtonText}>Add service</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {tab !== 'stored' ? (
        <Pressable
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={() => void handleSave()}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save compose'}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  subheading: { color: colors.text, fontSize: 13, fontWeight: '600' },
  tabs: { flexDirection: 'row', gap: 4 },
  tab: { borderWidth: 1, borderColor: colors.borderChip, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  tabActive: { borderColor: colors.accent, backgroundColor: colors.bgActive },
  tabText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: colors.accent },
  yamlInput: {
    minHeight: 280,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 20,
    padding: spacing.sm,
  },
  yamlReadonly: { minHeight: 160, opacity: 0.95 },
  serviceList: { gap: spacing.sm },
  serviceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  serviceNameInput: { color: colors.accent, fontFamily: 'monospace', fontSize: 13, fontWeight: '600', flex: 1 },
  removeText: { color: colors.errorText, fontSize: 12, fontWeight: '600' },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontFamily: 'monospace',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  saveButton: { alignSelf: 'flex-start', borderRadius: 8, backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 10 },
  saveButtonText: { color: colors.buttonText, fontSize: 14, fontWeight: '700' },
  secondaryButton: { alignSelf: 'flex-start', borderRadius: 8, borderWidth: 1, borderColor: colors.borderChip, paddingHorizontal: 10, paddingVertical: 7 },
  secondaryButtonText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },
})
