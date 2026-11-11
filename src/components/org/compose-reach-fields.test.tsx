// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReachFields } from './compose-reach-fields'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui', () => ({
  TextField: (props: Readonly<Record<string, unknown>>) => (
    <input
      aria-label={props.accessibilityLabel as string}
      value={props.value as string}
      onChange={(event) => (props.onChangeText as (value: string) => void)(event.target.value)}
    />
  ),
  MonoText: (props: Readonly<Record<string, unknown>>) => (
    <code role="alert">{props.children as string}</code>
  ),
  Checkbox: (props: Readonly<Record<string, unknown>>) => (
    <input
      type="checkbox"
      aria-label={props.accessibilityLabel as string}
      checked={props.checked as boolean}
      disabled={props.disabled as boolean}
      onChange={props.onPress as () => void}
    />
  ),
}))

afterEach(cleanup)

const SERVICES = [
  { name: 'web', account: 'blog' },
  { name: 'api', account: 'blog' },
  { name: 'shop', account: 'store' },
]

function setup(reach?: { port: number; from: string[] }) {
  const onChange = vi.fn()
  const view = render(
    <ReachFields reach={reach} services={SERVICES} disabled={false} onChange={onChange} />
  )
  const port = () => screen.getByLabelText<HTMLInputElement>('Container port')
  const box = (name: string) => screen.getByLabelText<HTMLInputElement>(`Reachable from ${name}`)
  return { onChange, view, port, box }
}

describe('ReachFields', () => {
  it('keeps a tick made before the port, then writes once both are there', () => {
    const { onChange, port, box } = setup()
    fireEvent.click(box('web'))
    expect(box('web').checked).toBe(true)
    expect(screen.getByRole('alert').textContent).toBe('Enter a port from 1 to 65535.')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(port(), { target: { value: '6379' } })
    expect(onChange).toHaveBeenLastCalledWith({ port: 6379, from: ['web'] })
  })

  it('lets the last ticked name be unticked, and removes reach when both are cleared', () => {
    const { onChange, port, box } = setup({ port: 6379, from: ['web'] })
    fireEvent.click(box('web'))
    expect(box('web').checked).toBe(false)
    expect(screen.getByRole('alert').textContent).toBe('Choose at least one site or app.')
    fireEvent.change(port(), { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith(undefined)
    expect(port().value).toBe('')
  })

  it('says so when the port is cleared with a name still ticked', () => {
    const { onChange, port } = setup({ port: 6379, from: ['web'] })
    fireEvent.change(port(), { target: { value: '' } })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('Enter a port from 1 to 65535.')
    expect(port().value).toBe('')
  })

  it('only offers names of the same account once one is ticked', () => {
    const { box } = setup({ port: 80, from: ['web'] })
    expect(box('api').disabled).toBe(false)
    expect(box('shop').disabled).toBe(true)
    expect(box('web').disabled).toBe(false)
    expect(screen.getByText(/only sites and apps of the same account/)).toBeTruthy()
  })

  it('follows the document when the saved value changes', () => {
    const { view, port, box, onChange } = setup({ port: 6379, from: ['web'] })
    view.rerender(
      <ReachFields
        reach={{ port: 7000, from: ['shop'] }}
        services={SERVICES}
        disabled={false}
        onChange={onChange}
      />
    )
    expect(port().value).toBe('7000')
    expect(box('shop').checked).toBe(true)
    expect(box('web').checked).toBe(false)
  })
})
