// @vitest-environment happy-dom
import { createElement, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS } from '@/components/ui/v4/rn-stub'
import { IconButton, IconPickerSheet } from './icon-picker-sheet'

type Props = { children?: ReactNode } & Record<string, unknown>

// Pressable and View pass on only what the component sets itself: aria-checked
// must be its own prop (React Native Web ignores accessibilityState), and the
// tab stop and arrow keys are web props.
vi.mock('react-native', async () => {
  const { reactNativeStub } = await import('@/components/ui/v4/rn-stub')
  return {
    ...reactNativeStub,
    Pressable: (props: Props) => {
      const state = (props.accessibilityState ?? {}) as Record<string, boolean>
      const child =
        typeof props.children === 'function'
          ? (props.children as (s: { pressed: boolean }) => ReactNode)({ pressed: false })
          : props.children
      return createElement(
        'button',
        {
          type: 'button',
          role: props.accessibilityRole as string,
          'aria-label': props.accessibilityLabel as string,
          'aria-checked': props['aria-checked'] as boolean | undefined,
          'aria-selected': state.selected,
          tabIndex: props.tabIndex as number | undefined,
          title: props.title as string | undefined,
          'data-hitslop': props.hitSlop as number | undefined,
          disabled: Boolean(props.disabled),
          onClick: () => (props.onPress as (() => void) | undefined)?.(),
        },
        child
      )
    },
    View: (props: Props) =>
      createElement(
        'div',
        { onKeyDown: props.onKeyDown as never, 'data-wrap': '' },
        createElement(reactNativeStub.View, props)
      ),
  }
})
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

  it('marks the picked cell with aria-checked and keeps one tab stop per group', async () => {
    open({ value: 'globe' })
    const radios = screen.getAllByRole('radio')
    expect(radios.filter((radio) => radio.getAttribute('aria-checked') === 'true')).toHaveLength(1)
    expect(screen.getByRole('radio', { name: 'Globe' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Cube' }).getAttribute('aria-checked')).toBe('false')
    expect(radios.filter((radio) => radio.getAttribute('tabindex') === '0')).toEqual([
      screen.getByRole('radio', { name: 'Globe' }),
    ])
  })

  it('puts the tab stop on the first cell when none is picked', () => {
    open()
    const stops = screen.getAllByRole('radio').filter((r) => r.getAttribute('tabindex') === '0')
    expect(stops).toEqual([screen.getByRole('radio', { name: 'Cube' })])
  })

  it('moves and picks with the arrow keys, Home and End', async () => {
    open({ value: 'cube' })
    const group = screen.getByRole('radiogroup', { name: 'Icons' }).parentElement as HTMLElement
    const at = (name: string) => screen.getByRole('radio', { name })
    await act(async () => {
      fireEvent.keyDown(at('Cube'), { key: 'ArrowRight' })
    })
    expect(at('Globe').getAttribute('aria-checked')).toBe('true')
    await act(async () => {
      fireEvent.keyDown(at('Globe'), { key: 'ArrowLeft' })
    })
    expect(at('Cube').getAttribute('aria-checked')).toBe('true')
    await act(async () => {
      fireEvent.keyDown(at('Cube'), { key: 'End' })
    })
    expect(at('Image').getAttribute('aria-checked')).toBe('true')
    await act(async () => {
      fireEvent.keyDown(at('Image'), { key: 'Home' })
    })
    expect(at('Cube').getAttribute('aria-checked')).toBe('true')
    await act(async () => {
      fireEvent.keyDown(at('Cube'), { key: 'Enter' })
    })
    expect(at('Cube').getAttribute('aria-checked')).toBe('true')
    await act(async () => {
      fireEvent.keyDown(group, { key: 'ArrowDown' })
    })
    expect(at('Cube').getAttribute('aria-checked')).toBe('true')
  })

  it('hides the Emoji tab entirely when the organization turned emoji off', () => {
    open({ isEmojiIconAllowed: false })
    expect(screen.queryByRole('tab', { name: 'Emoji' })).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'Emoji' })).toBeNull()
    expect(screen.getByRole('radiogroup', { name: 'Icons' })).toBeTruthy()
  })

  it('keeps a stored emoji as the current choice when emoji are not offered', async () => {
    const { onSave } = open({ value: '🚀', isEmojiIconAllowed: false })
    expect(screen.queryByRole('tab', { name: 'Emoji' })).toBeNull()
    expect(screen.getByText('Current emoji (kept until you pick another)')).toBeTruthy()
    expect(screen.queryByText('Default')).toBeNull()
    // Nothing would change, so Use Icon cannot clear the stored emoji.
    expect(screen.getByRole('button', { name: 'Use Icon' }).hasAttribute('disabled')).toBe(true)
    // Resetting to the default on purpose still works.
    await click(screen.getByRole('button', { name: 'Reset to Default' }))
    expect(screen.getByText('Default')).toBeTruthy()
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

  it('empties the paste field when a cell is picked', async () => {
    open()
    await click(screen.getByRole('tab', { name: 'Emoji' }))
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Paste an emoji'), { target: { value: 'nope' } })
    })
    expect(screen.getByRole('button', { name: 'Use Icon' }).hasAttribute('disabled')).toBe(true)
    await click(screen.getByRole('radio', { name: 'rocket launch' }))
    expect((screen.getByLabelText('Paste an emoji') as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Use Icon' }).hasAttribute('disabled')).toBe(false)
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
    const button = screen.getByRole('button', { name: 'Change the organization icon' })
    expect(button.getAttribute('data-hitslop')).toBe('2')
    await click(button)
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
    expect(screen.getByRole('img', { name: 'Organization icon' })).toBeTruthy()
    expect(screen.getByTestId('default')).toBeTruthy()
  })
})
