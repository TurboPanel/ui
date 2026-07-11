import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  composeDocumentToYaml,
  normalizeCompose,
  yamlToComposeDocument,
  type ComposeDocument,
} from '@/lib/compose'
import { colors, spacing } from '@/lib/theme'

type EditorTab = 'yaml' | 'visual'

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
  const [tab, setTab] = useState<EditorTab>('yaml')
  const [draft, setDraft] = useState<ComposeDocument>(() => normalizeCompose(document))
  const [yaml, setYaml] = useState(() => composeDocumentToYaml(document))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const normalized = normalizeCompose(document)
    setDraft(normalized)
    setYaml(composeDocumentToYaml(normalized))
  }, [document])

  const updateDraft = (next: ComposeDocument) => {
    setDraft(next)
    setYaml(composeDocumentToYaml(next))
    setError(null)
  }

  const handleSave = async () => {
    try {
      const next = tab === 'yaml' ? yamlToComposeDocument(yaml) : draft
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

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.tabs}>
          {(['yaml', 'visual'] as const).map((entry) => (
            <Pressable
              key={entry}
              style={[styles.tab, tab === entry && styles.tabActive]}
              onPress={() => {
                if (entry === 'yaml') {
                  setYaml(composeDocumentToYaml(draft))
                }
                setTab(entry)
              }}
            >
              <Text style={[styles.tabText, tab === entry && styles.tabTextActive]}>
                {entry === 'yaml' ? 'YAML' : 'Visual'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {tab === 'yaml' ? (
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
      ) : (
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
      )}

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.saveButton, saving && styles.buttonDisabled]}
        onPress={() => void handleSave()}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save compose'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
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
