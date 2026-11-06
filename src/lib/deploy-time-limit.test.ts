import { describe, expect, it } from 'vitest'
import { checkDeployTimeLimit } from './deploy-time-limit'

describe('checkDeployTimeLimit', () => {
  it('accepts whole minutes from 5 to 240', () => {
    expect(checkDeployTimeLimit('5')).toEqual({ minutes: 5 })
    expect(checkDeployTimeLimit(' 240 ')).toEqual({ minutes: 240 })
  })
  it('treats blank as the default of 30', () => {
    expect(checkDeployTimeLimit('  ')).toEqual({ minutes: 30 })
  })
  it.each(['4', '241', '0', '-5', '1.5', '10m', 'abc', '99999999999999999999'])(
    'rejects %s',
    (text) => {
      expect(checkDeployTimeLimit(text)).toHaveProperty('error')
    }
  )
})
