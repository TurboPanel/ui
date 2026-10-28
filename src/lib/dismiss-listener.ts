/**
 * Web only: call `dismiss` when the person presses Escape or presses anywhere
 * outside the element `inside()` returns. A press inside it is left alone, and
 * so is any press while that element is not a DOM node yet (native, or not
 * drawn), so a control never closes under the press meant for it.
 * Returns the cleanup; without a document there is nothing to listen to.
 */
export function listenForDismiss(
  doc: Document | undefined,
  inside: () => unknown,
  dismiss: () => void
): () => void {
  if (!doc) return () => undefined
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') dismiss()
  }
  const onPointerDown = (event: Event) => {
    const node = inside()
    if (!isDomNode(node)) return
    if (event.target instanceof Node && node.contains(event.target)) return
    dismiss()
  }
  doc.addEventListener('keydown', onKeyDown)
  doc.addEventListener('pointerdown', onPointerDown, true)
  return () => {
    doc.removeEventListener('keydown', onKeyDown)
    doc.removeEventListener('pointerdown', onPointerDown, true)
  }
}

function isDomNode(value: unknown): value is Node {
  return typeof Node !== 'undefined' && value instanceof Node
}
