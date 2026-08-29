import { useMemo } from 'react'
import { Select } from '@/components/ui'

/**
 * Timezone picker over the shared searchable {@link Select} — ~600 IANA zones
 * make the filter field and land-on-current-value scroll essential.
 */
export function ServerTimezonePicker({
  value,
  options,
  disabled,
  placeholder,
  noneLabel,
  onChange,
}: Readonly<{
  value: string | null
  options: readonly string[]
  disabled: boolean
  placeholder: string
  /** When set, prepends a null option (e.g. fleet default "None"). */
  noneLabel?: string
  onChange: (timezone: string | null) => void
}>) {
  const sorted = useMemo(
    () =>
      [...options]
        .sort((a, b) => a.localeCompare(b))
        .map((tz) => ({ value: tz, label: tz })),
    [options],
  )

  return (
    <Select
      value={value}
      options={sorted}
      placeholder={placeholder}
      disabled={disabled}
      noneLabel={noneLabel}
      mono
      searchPlaceholder="Filter timezones"
      accessibilityLabel="Timezone"
      onChange={onChange}
    />
  )
}
