// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { yamlToComposeDocument } from '@/lib/compose/convert'
import {
  ComposeHostingReadOnly,
  composeHostingBlockId,
} from '@/components/org/compose-hosting-readonly'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)

afterEach(() => {
  cleanup()
  globalThis.history.replaceState(null, '', '/')
})

const withHosting = yamlToComposeDocument(
  [
    'services:',
    '  website:',
    '    x-turbopanel:',
    '      hosting:',
    '        - hostname: example.test',
    '          www: www-to-root',
    '          tls:',
    '            mode: automatic',
    '  worker: {}',
  ].join('\n')
)

describe('ComposeHostingReadOnly', () => {
  it('shows the hostnames the file sets in words, with the keys on request', () => {
    render(<ComposeHostingReadOnly document={withHosting} />)
    expect(screen.getByText('Hostnames in this file')).toBeTruthy()
    expect(document.body.textContent).toContain('example.test')
    expect(document.body.textContent).toContain('www.example.test → example.test')
    expect(document.body.textContent).toContain('Let’s Encrypt (free, renews automatically)')
    expect(document.body.textContent).not.toContain('x-turbopanel')
    fireEvent.click(screen.getByText('Show in configuration'))
    expect(document.body.textContent).toContain('x-turbopanel:')
  })

  it('opens with the keys shown when the Hosting screen linked to a service', () => {
    globalThis.history.replaceState(null, '', '/compose?hosting=website')
    render(<ComposeHostingReadOnly document={withHosting} />)
    expect(document.body.textContent).toContain('mode: automatic')
    expect(screen.getByText('Hide configuration')).toBeTruthy()
  })

  it('renders nothing for a file that sets no hostnames', () => {
    render(<ComposeHostingReadOnly document={yamlToComposeDocument('services:\n  web: {}\n')} />)
    expect(screen.queryByText('Hostnames in this file')).toBeNull()
  })

  it('names each service block so a link can scroll to it', () => {
    expect(composeHostingBlockId('website')).toBe('compose-hosting-website')
  })
})
