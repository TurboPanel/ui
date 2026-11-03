// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PUBLIC_URL_ENTRY_HINT, PUBLIC_URL_FIXED_PORT_HINT } from '@/lib/public-url-entry'
import { AddPublicUrlRow } from './public-url-fields'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', async () => ({
  ...(await import('./access/access-ui-stub')).accessUiStub,
  FormField: ({ children }: Readonly<{ children: ReactNode }>) => <div>{children}</div>,
  SegmentedControl: () => <div />,
}))

const entry = { scheme: 'https' as const, host: '', port: '' }
const noop = () => {}

afterEach(cleanup)

describe('AddPublicUrlRow', () => {
  it('offers a Port box and the port hint by default', () => {
    render(
      <AddPublicUrlRow
        entry={entry}
        entryError={null}
        busy={false}
        onEntryChange={noop}
        onAddUrl={noop}
      />
    )
    expect(screen.getByLabelText('Port')).toBeTruthy()
    expect(screen.getByText(PUBLIC_URL_ENTRY_HINT)).toBeTruthy()
  })

  it('has no Port box and no port wording when the port is fixed', () => {
    render(
      <AddPublicUrlRow
        entry={entry}
        entryError={null}
        busy={false}
        fixedPort
        onEntryChange={noop}
        onAddUrl={noop}
      />
    )
    expect(screen.queryByLabelText('Port')).toBeNull()
    expect(screen.getByLabelText('Hostname')).toBeTruthy()
    expect(screen.getByText(PUBLIC_URL_FIXED_PORT_HINT)).toBeTruthy()
  })
})
