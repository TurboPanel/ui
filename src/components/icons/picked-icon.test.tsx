// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResourceIcon } from './picked-icon'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)

afterEach(cleanup)

const fallback = <span data-testid="default">default</span>

function draw(icon: string | null | undefined, isEmojiIconAllowed: boolean) {
  return render(
    <ResourceIcon
      icon={icon}
      isEmojiIconAllowed={isEmojiIconAllowed}
      size={20}
      color="currentColor"
      fallback={fallback}
    />
  )
}

describe('ResourceIcon', () => {
  it('draws a key as its glyph, whatever the emoji setting', () => {
    for (const allowed of [true, false]) {
      const { container, queryByTestId, unmount } = draw('mail', allowed)
      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('width')).toBe('20')
      expect(container.querySelector('rect')).not.toBeNull()
      expect(queryByTestId('default')).toBeNull()
      unmount()
    }
  })

  it('draws an emoji as text sized to the box while emoji are allowed', () => {
    const { getByText, queryByTestId } = draw('🚀', true)
    const emoji = getByText('🚀')
    expect(JSON.parse(emoji.getAttribute('data-style') ?? '{}')).toMatchObject({
      fontSize: 17,
      lineHeight: 20,
    })
    expect(queryByTestId('default')).toBeNull()
  })

  it('draws the default for a stored emoji while emoji are off', () => {
    const { queryByText, getByTestId } = draw('🚀', false)
    expect(queryByText('🚀')).toBeNull()
    expect(getByTestId('default')).toBeTruthy()
  })

  it('draws the default for no icon and for an unknown value', () => {
    for (const icon of [null, undefined, 'server']) {
      const { getByTestId, container, unmount } = draw(icon, true)
      expect(getByTestId('default')).toBeTruthy()
      expect(container.querySelector('svg')).toBeNull()
      unmount()
    }
  })
})
