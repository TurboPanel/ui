// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NodeAppModeField, isCustomNodeAppMode } from './node-app-mode-field'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>
type Option = { value: string; label: string; accessibilityLabel?: string }

vi.mock('@/components/ui', () => ({
  Button: ({ label, onPress }: Props) => (
    <button type="button" onClick={onPress as () => void}>
      {label as string}
    </button>
  ),
  ButtonRow: ({ children }: Props) => <div>{children}</div>,
  ModalSheet: ({ visible, title, children, footer }: Props) =>
    visible ? (
      <div role="dialog" aria-label={title as string}>
        {children}
        {footer as ReactNode}
      </div>
    ) : null,
  SegmentedControl: ({ options, value, onChange, disabled }: Props) => (
    <div>
      {(options as Option[]).map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.accessibilityLabel ?? option.label}
          aria-pressed={option.value === value}
          disabled={disabled as boolean}
          onClick={() => (onChange as (v: string) => void)(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
  TextField: ({ label, value, onChangeText, onSubmitEditing, error }: Props) => (
    <div>
      <input
        aria-label={label as string}
        value={value as string}
        onChange={(event) => (onChangeText as (v: string) => void)(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (onSubmitEditing as () => void)()
        }}
      />
      {error ? <span role="alert">{error as string}</span> : null}
    </div>
  ),
}))

/** The field with its value held the way the settings form holds it. */
function Harness({
  initial = 'production',
  onChange = () => undefined,
  disabled = false,
}: Readonly<{ initial?: string; onChange?: (value: string) => void; disabled?: boolean }>) {
  const [mode, setMode] = useState(initial)
  return (
    <NodeAppModeField
      value={mode}
      disabled={disabled}
      onChange={(next) => {
        setMode(next)
        onChange(next)
      }}
    />
  )
}

const option = (name: string | RegExp) => screen.getByRole('button', { name })
const pressed = (name: string | RegExp) => option(name).getAttribute('aria-pressed')
const dialog = () => screen.queryByRole('dialog', { name: 'Custom application mode' })
const valueInput = () => screen.getByLabelText('NODE_ENV value') as HTMLInputElement
const type = (value: string) => fireEvent.change(valueInput(), { target: { value } })
const clickSave = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }))

afterEach(cleanup)

describe('isCustomNodeAppMode', () => {
  it('treats only values other than production and development as custom', () => {
    expect(isCustomNodeAppMode('production')).toBe(false)
    expect(isCustomNodeAppMode('development')).toBe(false)
    expect(isCustomNodeAppMode('staging')).toBe(true)
  })
})

describe('NodeAppModeField', () => {
  it('switches between production and development without a popup', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    expect(pressed('production')).toBe('true')
    expect(option('Custom…').textContent).toBe('Custom…')
    fireEvent.click(option('development'))
    expect(onChange).toHaveBeenLastCalledWith('development')
    expect(pressed('development')).toBe('true')
    fireEvent.click(option('production'))
    expect(onChange).toHaveBeenLastCalledWith('production')
    expect(dialog()).toBeNull()
  })

  it('opens the popup from Custom… and saves the trimmed value as the selected option', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.click(option('Custom…'))
    expect(dialog()).not.toBeNull()
    expect(valueInput().value).toBe('')
    type('  staging ')
    clickSave()
    expect(onChange).toHaveBeenLastCalledWith('staging')
    expect(dialog()).toBeNull()
    expect(pressed('Custom mode staging, press to edit')).toBe('true')
    expect(option(/Custom mode staging/).textContent).toBe('staging')
    expect(pressed('production')).toBe('false')
  })

  it('edits a saved custom value from the same popup, starting from that value', () => {
    const onChange = vi.fn()
    render(<Harness initial="staging" onChange={onChange} />)
    expect(pressed(/Custom mode staging/)).toBe('true')
    fireEvent.click(option(/Custom mode staging/))
    expect(valueInput().value).toBe('staging')
    type('test')
    fireEvent.keyDown(valueInput(), { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith('test')
    expect(option(/Custom mode test/).textContent).toBe('test')
  })

  it('Cancel closes the popup and keeps the value', () => {
    const onChange = vi.fn()
    render(<Harness initial="staging" onChange={onChange} />)
    fireEvent.click(option(/Custom mode staging/))
    type('other')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(dialog()).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(option(/Custom mode staging/))
    expect(valueInput().value).toBe('staging')
  })

  it('shows what is wrong next to the field and will not save a bad value', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.click(option('Custom…'))
    expect(screen.queryByRole('alert')).toBeNull()
    clickSave()
    expect(screen.getByRole('alert').textContent).toBe('Enter a value.')
    type('my mode')
    expect(screen.getByRole('alert').textContent).toMatch(/^Use only letters, digits/)
    type('-staging')
    expect(screen.getByRole('alert').textContent).toBe('Start with a letter or a digit.')
    type('a'.repeat(65))
    expect(screen.getByRole('alert').textContent).toBe('Use at most 64 characters.')
    clickSave()
    expect(onChange).not.toHaveBeenCalled()
    expect(dialog()).not.toBeNull()
    type('qa_2')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('typing a main mode into the popup selects that main option', () => {
    render(<Harness initial="staging" />)
    fireEvent.click(option(/Custom mode staging/))
    type('development')
    clickSave()
    expect(pressed('development')).toBe('true')
    expect(option('Custom…').textContent).toBe('Custom…')
  })

  it('disables every option when the settings cannot be changed', () => {
    render(<Harness disabled />)
    expect((option('Custom…') as HTMLButtonElement).disabled).toBe(true)
    expect((option('development') as HTMLButtonElement).disabled).toBe(true)
  })
})
