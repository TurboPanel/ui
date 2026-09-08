import { useState } from 'react'
import { Text } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { InlineNotice, SectionPanel, SegmentedControl, type SegmentedOption } from '@/components/ui'
import type { ServerDetailRecord, ServerMachineClass } from '@/lib/instance-api'
import { useSetServerMachineClass } from '@/lib/queries/servers'

type MachineClassChoice = 'auto' | ServerMachineClass

const MACHINE_CLASS_OPTIONS: readonly SegmentedOption<MachineClassChoice>[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'physical', label: 'Physical' },
  { value: 'virtual', label: 'Virtual' },
]

function toChoice(machineClass: ServerMachineClass | null): MachineClassChoice {
  return machineClass ?? 'auto'
}

function fromChoice(choice: MachineClassChoice): ServerMachineClass | null {
  return choice === 'auto' ? null : choice
}

function machineClassSummary(machineClass: ServerMachineClass | null): string {
  switch (machineClass) {
    case 'physical':
      return 'Physical · hardware-sensor slots entitled'
    case 'virtual':
      return 'Virtual · no hardware-sensor slots'
    default:
      return 'Auto · inferred from what the daemon discovers'
  }
}

/**
 * Overview-tab pin for `server.machine_class`. The class decides which
 * metrics slots the license *entitles* on this host — it never changes what
 * the daemon collects: a VM has no hwmon chips to read, so pinning it
 * Physical only reserves slots that stay empty, and a physical host pinned
 * Virtual keeps its sensors but loses the entitlement to store them. Auto
 * (`null`) lets ingest infer `physical` once sensors are discovered; ingest
 * never infers `virtual`.
 */
export function ServerMachineClassPanel({
  orgId,
  server,
  canManage,
}: Readonly<{
  orgId: string
  server: ServerDetailRecord
  canManage: boolean
}>) {
  const mutation = useSetServerMachineClass(orgId, server.id)
  const [error, setError] = useState<string | null>(null)
  const current = toChoice(server.machineClass)
  const readOnly = !canManage

  const onChange = (choice: MachineClassChoice) => {
    if (readOnly || choice === current) return
    setError(null)
    mutation.mutate(fromChoice(choice), {
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Failed to save machine class')
      },
    })
  }

  return (
    <SectionPanel
      title="Machine class"
      hint={machineClassSummary(server.machineClass)}
      collapsible
      defaultCollapsed
    >
      <InlineNotice
        title="The pin sets entitlement, not what the daemon collects"
        body="Physical unlocks the hardware-sensor slots your tier includes; Virtual suppresses them. A virtual machine emits no sensor row at any tier, so pinning it Physical reserves slots that stay empty. Auto infers Physical once sensors are discovered and never infers Virtual."
      />
      <SegmentedControl
        options={MACHINE_CLASS_OPTIONS}
        value={current}
        onChange={onChange}
        disabled={readOnly || mutation.isPending}
        accessibilityLabel="Machine class"
      />
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {readOnly ? <Text style={panelStyles.muted}>Manage permission required.</Text> : null}
      {mutation.isPending ? <Text style={panelStyles.muted}>Saving…</Text> : null}
    </SectionPanel>
  )
}
