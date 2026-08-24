/**
 * Environment options for the project scope selector.
 *
 * The **Project** scope is never one of these: it is always its own button,
 * always first, and never hidden. These are the environments that sit to its
 * right — as chips while there is only one, and behind a searchable picker once
 * there are more (platform projects place one environment per server, so the
 * list grows with the fleet).
 */

/** Environments rendered as chips alongside Project, at most this many. */
export const PROJECT_SCOPE_CHIP_MAX_ENVIRONMENTS = 1

/** Show the picker's filter field once it lists at least this many options. */
export const PROJECT_SCOPE_SEARCH_MIN = 8

export type ProjectScopeOption = Readonly<{
  environmentId: string
  label: string
  /** Secondary line in the picker (status, placement, …). */
  detail?: string | null
}>

export function scopeOptionMatchesQuery(
  option: ProjectScopeOption,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  if (option.label.toLowerCase().includes(needle)) return true
  if (option.detail?.toLowerCase().includes(needle)) return true
  return option.environmentId.toLowerCase().includes(needle)
}

export function filterProjectScopeOptions(
  options: readonly ProjectScopeOption[],
  query: string,
): ProjectScopeOption[] {
  return options.filter((option) => scopeOptionMatchesQuery(option, query))
}

/** True once the environment list is past what a chip strip should carry. */
export function shouldUseScopePicker(environmentCount: number): boolean {
  return environmentCount > PROJECT_SCOPE_CHIP_MAX_ENVIRONMENTS
}

/** True once the picker is long enough that scanning beats scrolling. */
export function shouldShowScopeSearch(optionCount: number): boolean {
  return optionCount >= PROJECT_SCOPE_SEARCH_MIN
}

/**
 * The environment the picker trigger stands for.
 *
 * With Project selected there is no active environment, but the trigger still
 * names the first one (unhighlighted) so the operator can see what is there and
 * what pressing it would move to — an empty or generic trigger hides the whole
 * list behind a guess.
 */
export function resolveScopeTriggerOption(
  options: readonly ProjectScopeOption[],
  activeEnvironmentId: string | null,
): ProjectScopeOption | undefined {
  if (activeEnvironmentId) {
    const active = options.find(
      (option) => option.environmentId === activeEnvironmentId,
    )
    if (active) return active
  }
  return options[0]
}
