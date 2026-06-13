import { useCallback, useEffect, useMemo, useState } from 'react'
import { router } from 'expo-router'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/developer/section-panel'
import { developerStyles } from '@/components/developer/developer-styles'
import { useDeveloper } from '@/lib/developer-context'
import {
  DRIZZLE_STUDIO_PROXY_PORT,
  drizzleStudioOpenUrl,
  fetchDatabaseStatus,
  fetchDrizzleStudioStatus,
  loadDrizzleLocalPort,
  resetDevInstance,
  saveDrizzleLocalPort,
  startDrizzleStudio,
  type DatabaseStatus,
} from '@/lib/instance-api'
import { DEVELOPER_SECTIONS } from '@/lib/developer-navigation'
import { colors } from '@/lib/theme'

const section = DEVELOPER_SECTIONS.find((s) => s.id === 'database')!

function openStudioUrl(url: string) {
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export function DatabaseSection() {
  const { healthOk } = useDeveloper()
  const [status, setStatus] = useState<DatabaseStatus | null>(null)
  const [studioRunning, setStudioRunning] = useState(false)
  const [remoteStudioPort, setRemoteStudioPort] = useState(4983)
  const [browserHostname, setBrowserHostname] = useState('')
  const [localPortInput, setLocalPortInput] = useState(String(loadDrizzleLocalPort()))
  const [testing, setTesting] = useState(false)
  const [openingStudio, setOpeningStudio] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBrowserHostname(window.location.hostname)
    }
  }, [])

  const localPort = useMemo(() => {
    const parsed = Number.parseInt(localPortInput.trim(), 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 4983
  }, [localPortInput])

  const usesLanProxy =
    browserHostname !== '' &&
    browserHostname !== 'localhost' &&
    browserHostname !== '127.0.0.1'

  const studioOpenUrl = useMemo(
    () => drizzleStudioOpenUrl({ hostname: browserHostname, localPort }),
    [browserHostname, localPort],
  )

  const refreshDbStatus = useCallback(async () => {
    try {
      const dbStatus = await fetchDatabaseStatus()
      setStatus(dbStatus)
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('Unauthorized') || err.message.includes('401'))
      ) {
        return
      }
      setStatus(null)
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : 'Failed to load database status',
      })
    }
  }, [])

  const refreshStudioStatus = useCallback(async () => {
    try {
      const studioStatus = await fetchDrizzleStudioStatus()
      setStudioRunning(studioStatus.running)
      setRemoteStudioPort(studioStatus.port)
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('Unauthorized') || err.message.includes('401'))
      ) {
        return
      }
      setStudioRunning(false)
    }
  }, [])

  useEffect(() => {
    void refreshDbStatus()
    void refreshStudioStatus()
    const timer = setInterval(() => void refreshStudioStatus(), 2000)
    return () => clearInterval(timer)
  }, [refreshDbStatus, refreshStudioStatus])

  useEffect(() => {
    if (!usesLanProxy) saveDrizzleLocalPort(localPort)
  }, [localPort, usesLanProxy])

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
      await startDrizzleStudio()
      setStudioRunning(true)
      setMessage({
        ok: true,
        text: usesLanProxy
          ? `API running. Open ${studioOpenUrl} — connects to ${browserHostname}:${DRIZZLE_STUDIO_PROXY_PORT} via Caddy.`
          : `API running. Forward port ${remoteStudioPort} in Cursor Ports, then open ${studioOpenUrl}.`,
      })
      openStudioUrl(studioOpenUrl)
    } catch (err) {
      const errText = err instanceof Error ? err.message : 'Failed to start Drizzle Studio'
      setMessage({
        ok: false,
        text: errText,
      })
    } finally {
      setOpeningStudio(false)
    }
  }

  const canTest = healthOk === true && !testing
  const canOpenStudio = healthOk === true && status?.configured === true && !openingStudio
  const canResetDev = healthOk === true && status?.configured === true && !resetting

  const onResetDevInstance = async () => {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Reset the dev instance? This drops all Postgres data, repushes schema.ts, and restarts the instance. You will be taken to a recovery screen while it restarts.',
      )
      if (!confirmed) return
    }

    setResetting(true)
    setMessage(null)
    try {
      await resetDevInstance()
      router.replace('/recovering?reason=reset')
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof Error ? err.message : 'Dev instance reset failed',
      })
    } finally {
      setResetting(false)
    }
  }

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
        1. Click “Start API &amp; open studio” (API listens on 127.0.0.1:{remoteStudioPort} on the
        host).
        {studioRunning ? ' API is running.' : ''}
      </Text>
      {usesLanProxy ? (
        <Text style={developerStyles.muted}>
          2. Caddy proxies the API over HTTPS on port {DRIZZLE_STUDIO_PROXY_PORT} ({browserHostname}
          ). Trust the platform CA (same cert as :8443) if Studio cannot connect.
        </Text>
      ) : (
        <>
          <Text style={developerStyles.muted}>
            2. Forward port {remoteStudioPort} in Cursor (Ports → + → {remoteStudioPort}).
          </Text>
          <Text style={developerStyles.inlineLabel}>Local forwarded port</Text>
          <TextInput
            style={developerStyles.input}
            value={localPortInput}
            onChangeText={setLocalPortInput}
            keyboardType="number-pad"
            placeholder={String(remoteStudioPort)}
            placeholderTextColor={colors.textMuted}
          />
        </>
      )}

      <Text style={developerStyles.inlineLabel}>Studio UI link</Text>
      <Pressable onPress={() => openStudioUrl(studioOpenUrl)}>
        <Text style={styles.studioLink}>{studioOpenUrl}</Text>
      </Pressable>
      <Text style={developerStyles.muted}>
        Read-only browse — no migrations or schema push.
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
          <Text style={developerStyles.buttonText}>Start API &amp; open studio</Text>
        )}
      </Pressable>

      <Text style={developerStyles.inlineLabel}>Reset dev instance</Text>
      <Text style={developerStyles.muted}>
        Early-dev only: drop the public schema, repush `src/db/schema.ts` with drizzle-kit,
        reprovision the root organization, and restart this instance. All database rows are
        permanently deleted.
      </Text>
      <Pressable
        style={[developerStyles.button, !canResetDev && developerStyles.buttonDisabled]}
        onPress={() => void onResetDevInstance()}
        disabled={!canResetDev}
      >
        {resetting ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={colors.buttonText} />
            <Text style={developerStyles.buttonText}>Resetting…</Text>
          </View>
        ) : (
          <Text style={developerStyles.buttonText}>Reset Dev Instance</Text>
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

const styles = StyleSheet.create({
  studioLink: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
    marginTop: 4,
    marginBottom: 4,
  },
})
