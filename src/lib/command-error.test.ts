import { describe, expect, it } from 'vitest'
import { commandErrorDetail, commandErrorLine } from './command-error'

describe('commandErrorLine', () => {
  it('prefers the control plane line', () => {
    expect(
      commandErrorLine({
        errorLine: ' Install Caddy: apt lock held ',
        errorMessage: 'ansible-playbook failed (exit 2): Install Caddy: apt lock held',
      }),
    ).toBe('Install Caddy: apt lock held')
  })

  it('falls back to the last non-empty line of an older control plane error', () => {
    expect(
      commandErrorLine({ errorMessage: 'Step 1\nStep 2\nsh: 1: next: not found\n\n' }),
    ).toBe('sh: 1: next: not found')
    expect(commandErrorLine({ error: 'only the legacy field' })).toBe('only the legacy field')
  })

  it('never returns the truncation marker', () => {
    expect(commandErrorLine({ errorMessage: '[...truncated] tail of a cut line' })).toBe(
      'tail of a cut line',
    )
    expect(commandErrorLine({ errorMessage: '[...truncated] ' })).toBeNull()
  })

  it('keeps the end of a very long line', () => {
    const line = commandErrorLine({ errorMessage: `${'x'.repeat(1000)} the cause` }) ?? ''
    expect(line).toHaveLength(300)
    expect(line.endsWith('the cause')).toBe(true)
  })

  it('is null without error text', () => {
    expect(commandErrorLine({})).toBeNull()
    expect(commandErrorLine({ errorLine: null, errorMessage: '  ' })).toBeNull()
  })
})

describe('commandErrorDetail', () => {
  it('is null when the line already says everything', () => {
    expect(commandErrorDetail({ errorLine: 'boom', errorMessage: 'boom' })).toBeNull()
    expect(commandErrorDetail({ errorMessage: '[...truncated] boom' })).toBeNull()
    expect(commandErrorDetail({})).toBeNull()
  })

  it('returns the whole text when it says more than the line', () => {
    expect(
      commandErrorDetail({
        errorLine: 'next: not found',
        errorMessage: 'build failed\nnext: not found',
      }),
    ).toBe('build failed\nnext: not found')
  })
})
