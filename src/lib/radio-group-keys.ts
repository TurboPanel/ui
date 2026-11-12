/**
 * Keyboard moves inside a web radio group with one tab stop: the arrow keys
 * step to the next or previous radio (wrapping), Home and End jump to the
 * ends. Shared by every hand-built radio group so they all behave alike.
 */

/** The parts of a React keydown event this needs. */
export type RadioGroupKeyEvent = Readonly<{
  key: string
  target: unknown
  currentTarget: unknown
  preventDefault: () => void
}>

/** The index a key moves to from `at` in a group of `count`, or null for a key that does not move. */
export function radioKeyTarget(key: string, at: number, count: number): number | null {
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === 'ArrowRight' || key === 'ArrowDown') return (at + 1) % count
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (at - 1 + count) % count
  return null
}

/**
 * Moves focus to the radio the key names and returns its index, or null when
 * the key does not move or the event did not come from one of the group's
 * radios. `event.currentTarget` is the group element.
 */
export function moveInRadioGroup(event: RadioGroupKeyEvent): number | null {
  const group = event.currentTarget as HTMLElement
  const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'))
  const at = radios.indexOf(event.target as HTMLElement)
  if (at < 0) return null
  const next = radioKeyTarget(event.key, at, radios.length)
  if (next === null) return null
  event.preventDefault()
  radios[next]?.focus()
  return next
}
