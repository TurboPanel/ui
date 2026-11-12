// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { moveInRadioGroup, radioKeyTarget } from '@/lib/radio-group-keys'

describe('radioKeyTarget', () => {
  it('steps with the arrows, wrapping, and jumps with Home and End', () => {
    expect(radioKeyTarget('ArrowRight', 0, 3)).toBe(1)
    expect(radioKeyTarget('ArrowDown', 2, 3)).toBe(0)
    expect(radioKeyTarget('ArrowLeft', 0, 3)).toBe(2)
    expect(radioKeyTarget('ArrowUp', 2, 3)).toBe(1)
    expect(radioKeyTarget('Home', 2, 3)).toBe(0)
    expect(radioKeyTarget('End', 0, 3)).toBe(2)
    expect(radioKeyTarget('Enter', 1, 3)).toBeNull()
  })
})

describe('moveInRadioGroup', () => {
  function group() {
    const root = document.createElement('div')
    for (const name of ['a', 'b', 'c']) {
      const radio = document.createElement('button')
      radio.setAttribute('role', 'radio')
      radio.textContent = name
      root.append(radio)
    }
    document.body.append(root)
    return { root, radios: Array.from(root.querySelectorAll('button')) }
  }

  it('focuses the radio the key names and returns its index', () => {
    const { root, radios } = group()
    const preventDefault = vi.fn()
    const next = moveInRadioGroup({
      key: 'ArrowRight',
      target: radios[0],
      currentTarget: root,
      preventDefault,
    })
    expect(next).toBe(1)
    expect(preventDefault).toHaveBeenCalled()
    expect(document.activeElement).toBe(radios[1])
  })

  it('ignores other keys and events from outside the radios', () => {
    const { root, radios } = group()
    const preventDefault = vi.fn()
    expect(
      moveInRadioGroup({ key: 'Enter', target: radios[0], currentTarget: root, preventDefault })
    ).toBeNull()
    expect(
      moveInRadioGroup({ key: 'ArrowRight', target: root, currentTarget: root, preventDefault })
    ).toBeNull()
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
