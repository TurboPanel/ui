import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button, ConfirmButton, MonoText, TextField } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  cronCommandIssue,
  cronJobNameIssue,
  cronScheduleIssue,
} from '@/lib/compose/cron'
import type { ComposeServiceCronJob } from '@/lib/compose/service-kind'
import { colors, spacing } from '@/lib/theme'

/** Mirrors the server's `MAX_CRON_JOBS_PER_SERVICE`. */
const MAX_JOBS = 20

/**
 * Scheduled jobs for a site or a node app.
 *
 * Each job becomes a systemd timer whose service sets `User=` to the service's
 * principal — which is why the copy says the account decides what it can run:
 * `ExecStart` reaches `execve` after privileges drop, so a job can only use a
 * runtime the account was granted.
 *
 * Validation here is a partial mirror of the server's (`@/lib/compose/cron`);
 * the save-time linter is authoritative and its messages win.
 */
export function CronFields({
  jobs,
  disabled,
  onChange,
}: Readonly<{
  jobs: readonly ComposeServiceCronJob[] | undefined
  disabled: boolean
  onChange: (jobs: ComposeServiceCronJob[] | undefined) => void
}>) {
  const current = jobs ?? []
  const [name, setName] = useState('')
  const [schedule, setSchedule] = useState('')
  const [command, setCommand] = useState('')
  const [error, setError] = useState<string | null>(null)

  const emit = (next: ComposeServiceCronJob[]) => {
    onChange(next.length > 0 ? next : undefined)
  }

  const handleAdd = () => {
    const trimmed = {
      name: name.trim(),
      schedule: schedule.trim(),
      command: command.trim(),
    }
    const issue = cronJobNameIssue(trimmed.name) ??
      cronScheduleIssue(trimmed.schedule) ??
      cronCommandIssue(trimmed.command)
    if (issue) {
      setError(issue)
      return
    }
    if (current.some((job) => job.name === trimmed.name)) {
      // Two jobs under one name would render one unit and silently lose a job.
      setError(`There is already a job called “${trimmed.name}”.`)
      return
    }
    if (current.length >= MAX_JOBS) {
      setError(`A service can have at most ${MAX_JOBS} scheduled jobs.`)
      return
    }
    setError(null)
    emit([...current, trimmed])
    setName('')
    setSchedule('')
    setCommand('')
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.detailLabel}>Scheduled jobs</Text>
      <Text style={panelStyles.muted}>
        Each job runs as this service&apos;s account, in its directory — so it
        can only use the runtimes that account was granted. Output goes to the
        log viewer.
      </Text>

      {current.map((job) => {
        // A job that was authored elsewhere (YAML, an older client) can be
        // invalid; say so on the row rather than only at save.
        const issue = cronScheduleIssue(job.schedule) ??
          cronCommandIssue(job.command)
        return (
          <View key={job.name} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={panelStyles.detailTitle}>{job.name}</Text>
              <MonoText style={styles.mono}>{job.schedule}</MonoText>
              <MonoText style={styles.mono}>{job.command}</MonoText>
              {issue ? (
                <Text style={panelStyles.error}>{issue}</Text>
              ) : null}
            </View>
            {!disabled ? (
              <ConfirmButton
                label="Remove"
                prompt={`Remove ${job.name}?`}
                confirmLabel="Remove"
                size="sm"
                onConfirm={() => {
                  emit(current.filter((entry) => entry.name !== job.name))
                }}
              />
            ) : null}
          </View>
        )
      })}

      {!disabled ? (
        <View style={styles.form}>
          {error ? <Text style={panelStyles.error}>{error}</Text> : null}
          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="wp-cron"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label="Schedule"
            value={schedule}
            onChangeText={setSchedule}
            placeholder="*/5 * * * *"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label="Command"
            value={command}
            onChangeText={setCommand}
            placeholder="php wp-cron.php"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={panelStyles.muted}>
            Cron syntax, or <MonoText>@daily</MonoText> /{' '}
            <MonoText>@hourly</MonoText>. The command runs directly — no shell,
            so no pipes or redirection. <MonoText>php</MonoText> resolves to the
            version this account is granted.
          </Text>
          <Button label="Add job" size="sm" onPress={handleAdd} />
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
    gap: 2,
  },
  mono: {
    color: colors.textDim,
  },
  form: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
})
