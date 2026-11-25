// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { useEffect, useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stepUpBroker } from '@/lib/step-up'
import { ReauthSheet } from './reauth-sheet'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/lib/instance-api', () => ({ submitReauth: vi.fn() }))
vi.mock('@/components/ui', () => ({
  Button: ({ label }: Readonly<{ label: string }>) => <button type="button">{label}</button>,
  ButtonRow: ({ children }: Readonly<{ children: ReactNode }>) => <div>{children}</div>,
  InlineNotice: () => null,
  TextField: ({ label }: Readonly<{ label: string }>) => <input aria-label={label} />,
  ModalSheet: function FakeModalSheet({
    title,
    children,
  }: Readonly<{ title: string; children: ReactNode }>) {
    useRegisteredLayer(title)
    return <section role="dialog">{children}</section>
  },
}))

/**
 * Like react-native-web's `Modal`: its layer is appended to `body` when the
 * component mounts, whether or not it is visible, and a later layer paints
 * above an earlier one. The marker node stands in for that layer.
 */
function useRegisteredLayer(name: string): void {
  const [node] = useState(() => {
    const created = document.createElement('div')
    created.setAttribute('data-sheet', name)
    document.body.appendChild(created)
    return created
  })
  useEffect(
    () => () => {
      node.remove()
    },
    [node]
  )
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

const challenge = { action: 'organization.delete', methods: ['password'] } as const

/** Layers in paint order (first is lowest). */
function sheetOrder(): string[] {
  return [...document.querySelectorAll('[data-sheet]')].map(
    (n) => n.getAttribute('data-sheet') ?? ''
  )
}

function DeleteDialog() {
  useRegisteredLayer('Delete Organization')
  return <section role="dialog">delete</section>
}

function Page({ open }: Readonly<{ open: boolean }>) {
  return (
    <>
      <ReauthSheet />
      {open ? <DeleteDialog /> : null}
    </>
  )
}

describe('ReauthSheet', () => {
  it('renders no dialog until a request needs a proof', () => {
    render(<ReauthSheet />)
    expect(sheetOrder()).toEqual([])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens above a dialog that was opened after the app started, and leaves nothing behind', async () => {
    const view = render(<Page open={false} />)
    view.rerender(<Page open />)
    let answer: Promise<boolean> = Promise.resolve(true)
    act(() => {
      answer = stepUpBroker.request(challenge)
    })
    expect(sheetOrder()).toEqual(['Delete Organization', 'Confirm it is you'])

    act(() => stepUpBroker.settle(false))
    await expect(answer).resolves.toBe(false)
    expect(sheetOrder()).toEqual(['Delete Organization'])
  })

  it('words the prompt so it is true when the organization setting is off', () => {
    render(<ReauthSheet />)
    act(() => {
      stepUpBroker.request({ action: 'project.delete', methods: ['password'] }).catch(() => {})
    })
    expect(screen.getByText('To delete this project, confirm it is you.')).toBeTruthy()
    act(() => stepUpBroker.settle(false))
  })
})
