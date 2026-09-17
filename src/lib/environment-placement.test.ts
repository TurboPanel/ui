import { describe, expect, it } from 'vitest'
import {
  COLOCATED_ONLY_PLACEMENT_HINT,
  emptyPlacementHint,
  placementDropdownOptions,
} from './environment-placement'

const control = { id: 'cp', connected: true, colocatedWithInstance: true }
const node = { id: 'node', connected: true, colocatedWithInstance: false }
const offline = { id: 'off', connected: false }

describe('environment placement picker', () => {
  it('lists connected servers minus the co-located control-plane host', () => {
    expect(placementDropdownOptions([control, node, offline], null)).toEqual([node])
  })

  it('keeps the current pin visible even when it is not otherwise eligible', () => {
    expect(placementDropdownOptions([control, node, offline], 'off')).toEqual([offline, node])
    expect(placementDropdownOptions([control, node], 'cp')).toEqual([control, node])
    expect(placementDropdownOptions([control, node], 'node')).toEqual([node])
  })

  it('explains an empty picker on a single-host install', () => {
    expect(placementDropdownOptions([control], null)).toEqual([])
    expect(emptyPlacementHint([control])).toBe(COLOCATED_ONLY_PLACEMENT_HINT)
    expect(emptyPlacementHint([offline])).toBe('No connected servers available.')
    expect(emptyPlacementHint([])).toBe('No connected servers available.')
  })
})
