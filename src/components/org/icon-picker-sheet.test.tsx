// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS } from '@/components/ui/v4/rn-stub'
import { IconButton, IconPickerSheet } from './icon-picker-sheet'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock(
  'expo-linear-gradient',
  async () => (await import('@/components/ui/v4/rn-stub')).linearGradientStub
)
vi.mock('@/components/ui', () => ({
  TextField: (props: Readonly<Record<string, unknown>>) => (
    <label>
      {props.label as string}
      <input
        aria-label={props.accessibilityLabel as string}
        value={props.value as string}
        onChange={(event) => (props.onChangeText as (value: string) => void)(event.target.value)}
      />
      {props.error ? <span role="alert">{props.error as string}</span> : null}
    </label>
  ),
}))

const fallback = <span data-testid="default" />

afterEach(cleanup)

function open(over: Partial<Parameters<typeof IconPickerSheet>[0]> = {}) {
  const onSave = vi.fn(async (_icon: string | null): Promise<string | null> => null)
  const onClose = vi.fn()
  render(
    <IconPickerSheet
      value={null}
      isEmojiIconAllowed
      fallback={fallback}
      onClose={onClose}
      onSave={onSave}
      {...over}
    />
  )
  return { onSave: (over.onSave as typeof onSave | undefined) ?? onSave, onClose }
}

async function click(element: Element) {
  await act(async () => {
    fireEvent.click(element)
  })
}

describe.each(SCENARIOS)('Icon picker ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('offers the twelve regular icons and saves the one picked', async () => {
    const { onSave, onClose } = open()
    expect(screen.getByRole('heading', { name: 'Choose an Icon' })).toBeTruthy()
    const icons = screen.getByRole('radiogroup', { name: 'Icons' })
    expect(icons.querySelectorAll('[role="radio"]')).toHaveLength(12)
    const use = screen.getByRole('button', { name: 'Use Icon' })
    expect(use.hasAttribute('disabled')).toBe(true)
    await click(screen.getByRole('radio', { name: 'Rocket' }))
    expect(screen.getByRole('radio', { name: 'Rocket' }).getAttribute('aria-checked')).toBe('true')
    await click(screen.getByRole('button', { name: 'Use Icon' }))
    expect(onSave).toHaveBeenCalledWith('rocket')
    expect(onClose).toHaveBeenCalled()
  })

  it('hides the Emoji tab entirely when the organization turned emoji off', () => {
    open({ isEmojiIconAllowed: false })
    expect(screen.queryByRole('tab', { name: 'Emoji' })).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'Emoji' })).toBeNull()
    expect(screen.getByRole('radiogroup', { name: 'Icons' })).toBeTruthy()
  })

  it('starts a stored emoji as the default while emoji are off', async () => {
    const { onSave } = open({ value: '🚀', isEmojiIconAllowed: false })
    expect(screen.getByText('Default')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reset to Default' }).hasAttribute('disabled')).toBe(
      true
    )
    // Saving the default replaces the stored emoji, on purpose.
    await click(screen.getByRole('button', { name: 'Use Icon' }))
    expect(onSave).toHaveBeenCalledWith(null)
  })

  it('opens on the Emoji tab for a stored emoji, filters it and picks one', async () => {
    const { onSave } = open({ value: '🚀' })
    expect(screen.getByRole('tab', { name: 'Emoji' }).getAttribute('aria-selected')).toBe('true')
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Filter emoji'), { target: { value: 'blue heart' } })
    })
    const emoji = screen.getByRole('radiogroup', { name: 'Emoji' })
    expect(emoji.querySelectorAll('[role="radio"]')).toHaveLength(1)
    await click(screen.getByRole('radio', { name: 'blue heart' }))
    await click(screen.getByRole('button', { name: 'Use Icon' }))
    expect(onSave).toHaveBeenCalledWith('💙')
  })

  it('says when no common emoji match the filter', async () => {
    open()
    await click(screen.getByRole('tab', { name: 'Emoji' }))
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Filter emoji'), { target: { value: 'zzz' } })
    })
    expect(screen.getByText(/No emoji match/)).toBeTruthy()
  })

  it('takes any single pasted emoji and refuses anything else', async () => {
    const { onSave } = open()
    await click(screen.getByRole('tab', { name: 'Emoji' }))
    const paste = screen.getByLabelText('Paste an emoji')
    await act(async () => {
      fireEvent.change(paste, { target: { value: 'hello' } })
    })
    expect(screen.getByRole('alert').textContent).toMatch(/exactly one emoji/)
    expect(screen.getByRole('button', { name: 'Use Icon' }).hasAttribute('disabled')).toBe(true)
    await act(async () => {
      fireEvent.change(paste, { target: { value: ' 🦖 ' } })
    })
    expect(screen.queryByRole('alert')).toBeNull()
    await click(screen.getByRole('button', { name: 'Use Icon' }))
    expect(onSave).toHaveBeenCalledWith('🦖')
  })

  it('resets to the default', async () => {
    const { onSave } = open({ value: 'globe' })
    await click(screen.getByRole('button', { name: 'Reset to Default' }))
    expect(screen.getByText('Default')).toBeTruthy()
    await click(screen.getByRole('button', { name: 'Use Icon' }))
    expect(onSave).toHaveBeenCalledWith(null)
  })

  it('keeps the sheet open and shows why a save was refused', async () => {
    const onSave = vi.fn(
      async (): Promise<string | null> =>
        'This organization has emoji icons turned off. Pick one of the regular icons.'
    )
    const { onClose } = open({ onSave })
    await click(screen.getByRole('radio', { name: 'Cube' }))
    await click(screen.getByRole('button', { name: 'Use Icon' }))
    expect(screen.getByRole('alert').textContent).toBe(
      'This organization has emoji icons turned off. Pick one of the regular icons.'
    )
    expect(onClose).not.toHaveBeenCalled()
    // Picking again clears the message.
    await click(screen.getByRole('radio', { name: 'Globe' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('closes on Cancel without saving', async () => {
    const { onSave, onClose } = open()
    await click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('IconButton', () => {
  it('opens the picker when it can, and is a plain box otherwise', async () => {
    const onPress = vi.fn()
    const { rerender } = render(
      <IconButton
        icon="rocket"
        isEmojiIconAllowed
        fallback={fallback}
        onPress={onPress}
        accessibilityLabel="Change the organization icon"
      />
    )
    await click(screen.getByRole('button', { name: 'Change the organization icon' }))
    expect(onPress).toHaveBeenCalled()
    rerender(
      <IconButton
        icon={null}
        isEmojiIconAllowed
        fallback={fallback}
        onPress={null}
        accessibilityLabel="Organization icon"
      />
    )
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByTestId('default')).toBeTruthy()
  })
})
