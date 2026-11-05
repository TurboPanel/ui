import { describe, expect, it, vi } from 'vitest'
import { CHANGE_ICON_ACTION, tileIconActionProps } from '@/lib/tile-icon-action'

describe('tileIconActionProps', () => {
  it('offers Change Icon and runs it only for that action', () => {
    const onChangeIcon = vi.fn()
    const props = tileIconActionProps(onChangeIcon)
    expect(props.accessibilityActions).toEqual([{ name: CHANGE_ICON_ACTION, label: 'Change Icon' }])
    props.onAccessibilityAction?.({ nativeEvent: { actionName: 'activate' } })
    expect(onChangeIcon).not.toHaveBeenCalled()
    props.onAccessibilityAction?.({ nativeEvent: { actionName: CHANGE_ICON_ACTION } })
    expect(onChangeIcon).toHaveBeenCalledTimes(1)
  })

  it('adds nothing when the icon cannot be changed', () => {
    expect(tileIconActionProps(undefined)).toEqual({})
  })
})
