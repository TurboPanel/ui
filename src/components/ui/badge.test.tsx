// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Badge, type BadgeTone } from '@/components/ui/badge'

// Uniwind turns `className` into styles at build time; here the stub keeps it
// as an attribute so the test can read which classes each tone asks for.
vi.mock('react-native', () => {
  const host = (tag: string) =>
    function Host({ children, className }: Readonly<{ children?: ReactNode; className?: string }>) {
      return createElement(tag, { className }, children)
    }
  return { View: host('div'), Text: host('span') }
})

afterEach(cleanup)

const TONES: Record<BadgeTone, { box: string[]; text: string }> = {
  ok: { box: ['border-ok', 'bg-ok-soft'], text: 'text-ok' },
  muted: { box: ['border-border-chip', 'bg-bg-secondary'], text: 'text-text-muted' },
  danger: { box: ['border-error', 'bg-transparent'], text: 'text-error-text' },
  pending: { box: ['border-pending', 'bg-transparent'], text: 'text-pending' },
  info: { box: ['border-blue', 'bg-bg-active-blue'], text: 'text-command' },
}

describe('Badge', () => {
  it.each(Object.keys(TONES) as BadgeTone[])('%s tone uses its token classes', (tone) => {
    render(<Badge label="Label" tone={tone} />)
    const text = screen.getByText('Label')
    const box = text.parentElement as HTMLElement
    for (const cls of TONES[tone].box) expect(box.className).toContain(cls)
    expect(text.className).toContain(TONES[tone].text)
  })

  it('shows the label and defaults to the muted tone', () => {
    render(<Badge label="Idle" />)
    const text = screen.getByText('Idle')
    expect(text.className).toContain('text-text-muted')
    expect(text.className).toContain('uppercase')
    expect((text.parentElement as HTMLElement).className).toContain('self-start')
  })
})
