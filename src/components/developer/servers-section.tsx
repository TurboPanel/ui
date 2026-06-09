import { useEffect, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { SectionPanel } from '@/components/developer/section-panel'
import { TargetChip } from '@/components/developer/target-chip'
import { developerStyles } from '@/components/developer/developer-styles'
import {
  createServer,
  fetchOrganizations,
  fetchServers,
  updateServer,
  type OrganizationRecord,
  type ServerRecord,
} from '@/lib/instance-api'
import { DEVELOPER_SECTIONS } from '@/lib/developer-navigation'
import { colors } from '@/lib/theme'

const section = DEVELOPER_SECTIONS.find((s) => s.id === 'servers')!

function organizationLabel(
  organizationId: string | null,
  organizations: OrganizationRecord[],
): string {
  if (!organizationId) return 'Unassigned'
  const org = organizations.find((entry) => entry.id === organizationId)
  return org ? `${org.displayName} (${org.slug})` : organizationId
}

export function ServersSection() {
  const [servers, setServers] = useState<ServerRecord[]>([])
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [newDisplayName, setNewDisplayName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [assigningId, setAssigningId] = useState<string | null>(null)

  const loadServers = async () => {
    setLoading(true)
    setError(null)
    try {
      const [serverResult, orgResult] = await Promise.all([
        fetchServers(),
        fetchOrganizations(),
      ])
      setServers(serverResult.servers)
      setOrganizations(orgResult.organizations)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load servers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadServers()
  }, [])

  const onAddServer = async () => {
    setAdding(true)
    setAddError(null)
    try {
      await createServer({ displayName: newDisplayName.trim() || null })
      setNewDisplayName('')
      await loadServers()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add server')
    } finally {
      setAdding(false)
    }
  }

  const onUpdateServer = async (id: string) => {
    setSaving(true)
    try {
      await updateServer(id, { displayName: editDisplayName.trim() || null })
      setEditingId(null)
      setEditDisplayName('')
      await loadServers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update server')
    } finally {
      setSaving(false)
    }
  }

  const onAssignOrganization = async (
    serverId: string,
    organizationId: string | null,
  ) => {
    setAssigningId(serverId)
    setError(null)
    try {
      await updateServer(serverId, { organizationId })
      await loadServers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign organization')
    } finally {
      setAssigningId(null)
    }
  }

  return (
    <SectionPanel title={section.label} hint={section.hint}>
      <Text style={developerStyles.inlineLabel}>Add server</Text>
      <TextInput
        style={developerStyles.input}
        placeholder="Display name (optional)"
        placeholderTextColor={colors.textMuted}
        value={newDisplayName}
        onChangeText={setNewDisplayName}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!adding}
      />
      <Pressable
        style={[developerStyles.button, adding && developerStyles.buttonDisabled]}
        onPress={() => void onAddServer()}
        disabled={adding}
      >
        <Text style={developerStyles.buttonText}>Add Server</Text>
      </Pressable>
      {addError ? <Text style={developerStyles.error}>{addError}</Text> : null}

      <Text style={developerStyles.inlineLabel}>Registered servers</Text>
      <Text style={developerStyles.muted}>
        Daemons auto-register on connect. Assign each server to an organization here.
      </Text>
      {error ? <Text style={developerStyles.error}>{error}</Text> : null}
      {loading && servers.length === 0 ? (
        <Text style={developerStyles.muted}>Loading…</Text>
      ) : servers.length === 0 ? (
        <Text style={developerStyles.muted}>No servers registered yet.</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {servers.map((server) => (
            <View key={server.id} style={developerStyles.detailCard}>
              <Text style={developerStyles.detailTitle}>
                {server.displayName ?? server.id}
              </Text>
              <Text style={developerStyles.detailLine}>
                <Text style={developerStyles.detailLabel}>ID: </Text>
                {server.id}
              </Text>
              <Text style={developerStyles.detailLine}>
                <Text style={developerStyles.detailLabel}>Organization: </Text>
                {organizationLabel(server.organizationId, organizations)}
              </Text>
              {server.options ? (
                <Text style={developerStyles.detailLine}>
                  <Text style={developerStyles.detailLabel}>Options: </Text>
                  {JSON.stringify(server.options)}
                </Text>
              ) : null}

              <Text style={developerStyles.inlineLabel}>Assign organization</Text>
              <View style={developerStyles.targets}>
                <TargetChip
                  label="Unassigned"
                  active={server.organizationId == null}
                  onPress={() => {
                    if (server.organizationId != null) {
                      void onAssignOrganization(server.id, null)
                    }
                  }}
                />
                {organizations.map((org) => (
                  <TargetChip
                    key={org.id}
                    label={org.displayName}
                    active={server.organizationId === org.id}
                    onPress={() => {
                      if (server.organizationId !== org.id) {
                        void onAssignOrganization(server.id, org.id)
                      }
                    }}
                  />
                ))}
              </View>
              {assigningId === server.id ? (
                <Text style={developerStyles.muted}>Saving organization…</Text>
              ) : null}

              {editingId === server.id ? (
                <View style={{ gap: 8 }}>
                  <TextInput
                    style={developerStyles.input}
                    placeholder="Display name (optional)"
                    placeholderTextColor={colors.textMuted}
                    value={editDisplayName}
                    onChangeText={setEditDisplayName}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!saving}
                  />
                  <Pressable
                    style={[developerStyles.button, saving && developerStyles.buttonDisabled]}
                    onPress={() => void onUpdateServer(server.id)}
                    disabled={saving}
                  >
                    <Text style={developerStyles.buttonText}>Save</Text>
                  </Pressable>
                  <Pressable
                    style={developerStyles.buttonSecondary}
                    onPress={() => {
                      setEditingId(null)
                      setEditDisplayName('')
                    }}
                    disabled={saving}
                  >
                    <Text style={developerStyles.buttonSecondaryText}>Cancel</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={developerStyles.buttonSecondary}
                  onPress={() => {
                    setEditingId(server.id)
                    setEditDisplayName(server.displayName ?? '')
                  }}
                >
                  <Text style={developerStyles.buttonSecondaryText}>Edit display name</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}
    </SectionPanel>
  )
}
