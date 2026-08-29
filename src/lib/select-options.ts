/**
 * Options and filter logic for the shared searchable {@link Select} control
 * (`src/components/ui/select.tsx`).
 *
 * MASTER "Selectors that grow": a fixed set stays a chip strip; a list that
 * grows (timezones, repositories, fleets) gets a searchable picker. This module
 * holds the pure parts so they stay unit-testable.
 */

/** Show the picker's filter field once it lists at least this many options. */
export const SELECT_SEARCH_MIN = 8

export type SelectOption = Readonly<{
  value: string
  label: string
  /** Secondary line in the picker row (status, placement, …). */
  detail?: string | null
}>

/**
 * IANA timezone IDs use underscores where people type spaces
 * ("America/New_York" vs "new york") — normalize both sides so either matches.
 */
function normalize(text: string): string {
  return text.toLowerCase().replaceAll('_', ' ')
}

export function selectOptionMatchesQuery(
  option: SelectOption,
  query: string,
): boolean {
  const needle = normalize(query.trim())
  if (!needle) return true
  if (normalize(option.label).includes(needle)) return true
  if (option.detail && normalize(option.detail).includes(needle)) return true
  return normalize(option.value).includes(needle)
}

export function filterSelectOptions(
  options: readonly SelectOption[],
  query: string,
): SelectOption[] {
  return options.filter((option) => selectOptionMatchesQuery(option, query))
}

/** True once the list is long enough that filtering beats scrolling. */
export function shouldShowSelectSearch(optionCount: number): boolean {
  return optionCount >= SELECT_SEARCH_MIN
}

/**
 * What the closed trigger reads. `null` value renders `noneLabel` when the
 * control offers an explicit none option, otherwise the placeholder.
 */
export function resolveSelectTriggerLabel(
  options: readonly SelectOption[],
  value: string | null,
  placeholder: string,
  noneLabel?: string,
): { label: string; isPlaceholder: boolean } {
  if (value === null) {
    if (noneLabel != null) return { label: noneLabel, isPlaceholder: false }
    return { label: placeholder, isPlaceholder: true }
  }
  const selected = options.find((option) => option.value === value)
  // A value the options do not (yet) contain still names itself — hiding it
  // behind the placeholder would misreport saved state while options load.
  return { label: selected?.label ?? value, isPlaceholder: false }
}
