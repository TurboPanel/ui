const STABLE_EMPTY_ARRAY: never[] = [];

/** Stable `[]` when `value` is missing — avoids new array refs in hook dependency lists. */
export function orEmptyArray<T>(value: T[] | null | undefined): T[] {
  if (value) {
    return value;
  }
  return STABLE_EMPTY_ARRAY;
}
