// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PUBLIC_URL_ENTRY_HINT, PUBLIC_URL_SELF_HOSTED_HINT } from '@/lib/public-url-entry'
import { AddPublicUrlRow } from './public-url-fields'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', async () => ({
  ...(await import('./access/access-ui-stub')).accessUiStub,
  FormField: ({ children }: Readonly<{ children: ReactNode }>) => <div>{children}</div>,
  SegmentedControl: ({ accessibilityLabel }: Readonly<{ accessibilityLabel: string }>) => (
    <div aria-label={accessibilityLabel} />
  ),
}))

const entry = { scheme: 'https' as const, host: '', port: '' }
const noop = () => {}

afterEach(cleanup)

describe('AddPublicUrlRow', () => {
  it('offers a scheme picker, a Port box and the port hint by default', () => {
    render(
      <AddPublicUrlRow
        entry={entry}
        entryError={null}
        busy={false}
        onEntryChange={noop}
        onAddUrl={noop}
      />
    )
    expect(screen.getByLabelText('Address scheme')).toBeTruthy()
    expect(screen.getByLabelText('Port')).toBeTruthy()
    expect(screen.getByText(PUBLIC_URL_ENTRY_HINT)).toBeTruthy()
  })

  it('has no scheme picker and no Port box on the self-hosted runtime', () => {
    render(
      <AddPublicUrlRow
        entry={entry}
        entryError={null}
        busy={false}
        selfHosted
        onEntryChange={noop}
        onAddUrl={noop}
      />
    )
    expect(screen.queryByLabelText('Address scheme')).toBeNull()
    expect(screen.queryByLabelText('Port')).toBeNull()
    expect(screen.getByLabelText('Hostname')).toBeTruthy()
    expect(screen.getByText(PUBLIC_URL_SELF_HOSTED_HINT)).toBeTruthy()
  })
})
