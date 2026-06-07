import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { SectionPanel } from '@/components/developer/section-panel'
import { developerStyles } from '@/components/developer/developer-styles'
import { useDeveloper } from '@/lib/developer-context'
import {
  fetchDatabaseStatus,
  fetchDrizzleStudioStatus,
  startDrizzleStudio,
  type DatabaseStatus,
} from '@/lib/instance-api'
import { DEVELOPER_SECTIONS } from '@/lib/developer-navigation'
import { colors } from '@/lib/theme'

const section = DEVELOPER_SECTIONS.find((s) => s.id === 'database')!

function openStudioPath(publicPath: string) {
  if (typeof window !== 'undefined') {
    window.open(publicPath, '_blank', 'noopener,noreferrer')
  }
}

export function DatabaseSection() {
  const { healthOk } = useDeveloper()
  const [status, setStatus] = useState<DatabaseStatus | null>(null)
  const [studioRunning, setStudioRunning] = useState(false)
  const [testing, setTesting] = useState(false)
  const [openingStudio, setOpeningStudio] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [dbStatus, studioStatus] = await Promise.all([
        fetchDatabaseStatus(),
        fetchDrizzleStudioStatus(),
      ])
      setStatus(dbStatus)
      setStudioRunning(studioStatus.running)
    } catch (err) {
      setStatus(null)
      setStudioRunning(false)
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : 'Failed to load database status',
      })
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 2000)
    return () => clearInterval(timer)
  }, [refresh])

  const onTest = async () => {
    setTesting(true)
    setMessage(null)
    try {
      const dbStatus = await fetchDatabaseStatus()
      setStatus(dbStatus)
      if (dbStatus.connected) {
        setMessage({
          ok: true,
          text: dbStatus.version
            ? `Connected (${dbStatus.transport ?? 'unknown'}). ${dbStatus.version}`
            : 'Connected.',
        })
      } else {
        setMessage({
          ok: false,
          text: dbStatus.error ?? 'Not connected',
        })
      }
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : 'Connection test failed',
      })
    } finally {
      setTesting(false)
    }
  }

  const onOpenStudio = async () => {
    setOpeningStudio(true)
    setMessage(null)
    try {
      const result = await startDrizzleStudio()
      setStudioRunning(true)
      openStudioPath(result.publicPath)
      setMessage({ ok: true, text: 'Drizzle Studio opened in a new tab.' })
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : 'Failed to start Drizzle Studio',
      })
    } finally {
      setOpeningStudio(false)
    }
  }

  const canTest = healthOk === true && !testing
  const canOpenStudio = healthOk === true && status?.configured === true && !openingStudio

  return (
    <SectionPanel title={section.label} hint={section.hint}>
      <View style={developerStyles.row}>
        <View
          style={[
            developerStyles.dot,
            status?.connected ? developerStyles.dotOk : developerStyles.dotBad,
          ]}
        />
        <Text style={developerStyles.rowText}>
          {status === null
            ? 'Checking database…'
            : !status.configured
              ? 'Postgres not configured'
              : status.connected
                ? `Connected via ${status.transport ?? 'unknown'}`
                : 'Configured but unreachable'}
        </Text>
      </View>

      {status?.configured ? (
        <Text style={developerStyles.muted}>
          Database {status.database ?? '—'} as {status.user ?? '—'}
          {status.version ? ` · ${status.version}` : ''}
        </Text>
      ) : (
        <Text style={developerStyles.muted}>
          Set `TURBOPANEL_PG_*` on the instance unit (see daemon `postgres` role).
        </Text>
      )}

      <Text style={developerStyles.inlineLabel}>Connection test</Text>
      <Text style={developerStyles.muted}>
        Runs `SELECT version()` against the configured Postgres (Unix socket or TCP).
      </Text>
      <Pressable
        style={[developerStyles.buttonSecondary, !canTest && developerStyles.buttonDisabled]}
        onPress={() => void onTest()}
        disabled={!canTest}
      >
        {testing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={colors.textBody} />
            <Text style={developerStyles.buttonSecondaryText}>Testing…</Text>
          </View>
        ) : (
          <Text style={developerStyles.buttonSecondaryText}>Test Postgres connection</Text>
        )}
      </Pressable>

      <Text style={developerStyles.inlineLabel}>Drizzle Studio</Text>
      <Text style={developerStyles.muted}>
        Browse schema and data read-only in the browser (dev only). Does not run migrations or push
        schema changes.
        {studioRunning ? ' Studio is running.' : ''}
      </Text>
      <Pressable
        style={[developerStyles.button, !canOpenStudio && developerStyles.buttonDisabled]}
        onPress={() => void onOpenStudio()}
        disabled={!canOpenStudio}
      >
        {openingStudio ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={colors.buttonText} />
            <Text style={developerStyles.buttonText}>Starting…</Text>
          </View>
        ) : (
          <Text style={developerStyles.buttonText}>Open Drizzle Studio</Text>
        )}
      </Pressable>

      {message ? (
        <Text style={message.ok ? developerStyles.muted : developerStyles.error}>
          {message.text}
        </Text>
      ) : null}
    </SectionPanel>
  )
}
