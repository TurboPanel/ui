import { createElement, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { webPointer } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import type { OrgServerRecord } from '@/lib/instance-api'
import { useOrgServers, useUpdateProject } from '@/lib/queries'
import { buildProjectOptionsPatch } from '@/lib/project-options'
import { colors } from '@/lib/theme'

function serverLabel(server: OrgServerRecord): string {
  return (
    server.displayName?.trim() ||
    server.hostname?.trim() ||
    server.id.slice(0, 8)
  )
}

function serverOptionLabel(server: OrgServerRecord): string {
  const base = serverLabel(server)
  return server.connected ? base : `${base} (offline)`
}

type HtmlSelect = {
  value: string
  focus: () => void
  click: () => void
  showPicker?: () => void
}

/**
 * Compact project-level server pin for the Compose panel header.
 * Empty state is a muted "+ Set Default Project Server (Optional)" button that
 * opens the native server picker (no custom dropdown / chevron). Writes
 * `project.options.defaultServerId`.
 */
export function ProjectServerHeaderControl() {
  const { orgId, projectId, project, canManage, projectAllowsMutations, setError } =
    useProjectContext()
  const canEdit = canManage && projectAllowsMutations
  const serversQuery = useOrgServers(orgId, { enabled: canEdit })
  const updateProject = useUpdateProject(orgId, projectId)
  const [selectEl, setSelectEl] = useState<HtmlSelect | null>(null)

  if (!canEdit || !project) return null

  const placementServerId = project.options?.defaultServerId ?? null
  const servers = serversQuery.data?.servers ?? []
  const sorted = [...servers].sort((a, b) =>
    serverOptionLabel(a).localeCompare(serverOptionLabel(b)),
  )
  const connected = sorted.filter((server) => server.connected)
  const selected = placementServerId
    ? sorted.find((server) => server.id === placementServerId)
    : undefined
  const options =
    selected && !selected.connected ? [selected, ...connected] : connected
  const busy = updateProject.isPending

  const save = async (serverId: string | null) => {
    setError(null)
    const nextOptions = buildProjectOptionsPatch(project, {
      defaultServerId: serverId,
    })
    const result = await updateProject.run({ options: nextOptions })
    if (!result.ok && updateProject.actionError) {
      setError(updateProject.actionError)
    }
  }

  const openPicker = () => {
    if (!selectEl || busy || options.length === 0) return
    try {
      if (typeof selectEl.showPicker === 'function') {
        selectEl.showPicker()
        return
      }
    } catch {
      // Fall through to click() when showPicker is blocked.
    }
    selectEl.focus()
    selectEl.click()
  }

  const hiddenSelect =
    Platform.OS === 'web'
      ? createElement(
          'select',
          {
            ref: setSelectEl,
            value: placementServerId ?? '',
            disabled: busy || options.length === 0,
            onChange: (event: { target: { value: string } }) => {
              const next = event.target.value
              if (next) {
                void save(next)
                return
              }
              void save(null)
            },
            'aria-label': 'Project-wide default server',
            style: {
              position: 'absolute',
              width: 1,
              height: 1,
              opacity: 0,
              pointerEvents: 'none',
              overflow: 'hidden',
            },
          },
          [
            createElement(
              'option',
              { key: '', value: '' },
              placementServerId ? 'Clear…' : 'Select server…',
            ),
            ...options.map((server) =>
              createElement(
                'option',
                { key: server.id, value: server.id },
                serverOptionLabel(server),
              ),
            ),
          ],
        )
      : null

  return (
    <View style={styles.root}>
      {hiddenSelect}
      {placementServerId && selected ? (
        <View style={styles.selectedRow}>
          <Pressable
            style={[styles.selectedChip, busy && styles.disabled, webPointer]}
            disabled={busy}
            onPress={openPicker}
            accessibilityRole="button"
            accessibilityLabel={`Project-wide default server: ${serverOptionLabel(selected)}. Change`}
          >
            <Text style={styles.selectedText} numberOfLines={1}>
              {serverOptionLabel(selected)}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.clearBtn, busy && styles.disabled, webPointer]}
            disabled={busy}
            onPress={() => {
              void save(null)
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear project-wide default server"
          >
            <Text style={styles.clearText}>×</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={[styles.addBtn, busy && styles.disabled, webPointer]}
          disabled={busy || options.length === 0}
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel="Set default project server (optional)"
        >
          <Text style={styles.addPlus}>+</Text>
          <Text style={styles.addLabel} numberOfLines={1}>
            Set Default Project Server (Optional)
          </Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    alignItems: 'flex-end',
    maxWidth: 280,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: 'transparent',
    paddingHorizontal: 8,
    paddingVertical: 5,
    minHeight: 28,
  },
  addPlus: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 16,
  },
  addLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  selectedChip: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minHeight: 28,
    maxWidth: 200,
    justifyContent: 'center',
  },
  selectedText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 18,
  },
  disabled: {
    opacity: 0.45,
  },
})
