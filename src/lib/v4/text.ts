/** Small wording helpers shared by the v4 logic modules. */

/** `1 change`, `2 changes`; pass `many` for irregular plurals. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** `A`, `A and B`, `A, B and C`. Empty entries are dropped. */
export function joinNames(names: readonly string[]): string {
  const list = names.filter((name) => name !== '')
  if (list.length < 2) return list.join('')
  return `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`
}

/** Lowercase url-safe id from a display name; `env` when nothing is left. */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part !== '')
    .join('-')
  return slug === '' ? 'env' : slug
}

/** Text shown for a value that is absent. */
export const NOT_SET = 'Not set'
