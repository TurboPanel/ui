import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ComposeEditorSection } from '@/components/org/compose-editor-section'
import { ComposeFlowRail } from '@/components/org/compose-flow-rail'
import { ProductionBadge } from '@/components/org/production-badge'
import {
  COMPOSE_QUICK_STARTS,
  composeQuickStartDocument,
  type ComposeQuickStartId,
} from '@/lib/compose/quick-starts'
import type { ComposeDocument } from '@/lib/compose'
import { colors, spacing } from '@/lib/theme'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'

export function ComposeBasePanel({
  document,
  onSave,
  saving = false,
  showQuickStarts = true,
  onQuickStart,
  defaultEditorView = 'visual',
  selectedQuickStartId = null,
}: Readonly<{
  document: unknown
  onSave: (document: ComposeDocument) => Promise<void>
  saving?: boolean
  showQuickStarts?: boolean
  onQuickStart?: (document: ComposeDocument) => void
  defaultEditorView?: 'visual' | 'editor'
  selectedQuickStartId?: ComposeQuickStartId | null
}>) {
  const handleQuickStart = (id: ComposeQuickStartId) => {
    const next = composeQuickStartDocument(id)
    onQuickStart?.(next)
    void onSave(next)
  }

  return (
    <View style={styles.root}>
      <ComposeFlowRail activeStep="base" />

      <View style={styles.header}>
        <Text style={styles.title}>Base compose</Text>
        <ProductionBadge />
      </View>

      {showQuickStarts ? (
        <View style={styles.quickStarts}>
          <Text style={styles.quickStartsLabel}>Quick start</Text>
          <View style={styles.quickStartRow}>
            {COMPOSE_QUICK_STARTS.map((entry) => {
              const selected = selectedQuickStartId === entry.id
              return (
                <Pressable
                  key={entry.id}
                  style={[
                    styles.quickStartChip,
                    selected && styles.quickStartChipSelected,
                    webPointer,
                  ]}
                  onPress={() => handleQuickStart(entry.id)}
                >
                  <View style={styles.quickStartMarker}>
                    <Text style={styles.quickStartMarkerText}>{entry.marker}</Text>
                  </View>
                  <Text style={styles.quickStartChipLabel}>{entry.label}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      ) : null}

      <ComposeEditorSection
        document={document}
        onSave={onSave}
        saving={saving}
        title="Services"
        defaultView={defaultEditorView}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  quickStarts: {
    gap: spacing.sm,
  },
  quickStartsLabel: {
    color: colors.textLabel,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  quickStartRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickStartChip: {
    minWidth: 108,
    flexGrow: 1,
    maxWidth: 160,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  quickStartChipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  quickStartMarker: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgInset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickStartMarkerText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  quickStartChipLabel: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
})
