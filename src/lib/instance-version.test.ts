import { afterEach, describe, expect, it } from 'vitest'
import {
  CLIENT_VERSION_HEADER,
  clientVersionHeaders,
  compareSemver,
  getClientVersion,
  getInstanceVersion,
  INSTANCE_VERSION_HEADER,
  instanceUnsupportedMessage,
  MIN_SUPPORTED_INSTANCE_VERSION,
  parseSemver,
  recordInstanceVersion,
  resetInstanceVersionStateForTests,
  resolveInstanceSupport,
  setClientVersion,
} from './instance-version'

function cmp(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa || !pb) throw new Error(`unparsable: ${a} / ${b}`)
  return Math.sign(compareSemver(pa, pb))
}

afterEach(() => {
  resetInstanceVersionStateForTests()
})

describe('parseSemver', () => {
  it('accepts release, pre-release, build metadata and a leading v', () => {
    expect(parseSemver('0.1.0')).toEqual({ major: 0, minor: 1, patch: 0, prerelease: [] })
    expect(parseSemver('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] })
    expect(parseSemver('0.1.0-rc.1+build.7')?.prerelease).toEqual(['rc', '1'])
    expect(parseSemver(' 0.1.0 ')?.patch).toBe(0)
  })

  it('rejects anything that is not a semver', () => {
    for (const bad of ['', '  ', 'dev', '0.1', '1.2.3.4', 'unstamped', undefined, null]) {
      expect(parseSemver(bad)).toBeNull()
    }
  })
})

describe('compareSemver', () => {
  it('follows semver precedence, pre-releases before their release', () => {
    expect(cmp('0.1.0', '0.1.0')).toBe(0)
    expect(cmp('0.1.1', '0.1.0')).toBe(1)
    expect(cmp('0.2.0', '0.1.9')).toBe(1)
    expect(cmp('1.0.0', '0.9.9')).toBe(1)
    expect(cmp('0.9.9', '1.0.0')).toBe(-1)
    expect(cmp('0.1.0-rc.1', '0.1.0')).toBe(-1)
    expect(cmp('0.1.0', '0.1.0-rc.1')).toBe(1)
    expect(cmp('0.1.0-rc.2', '0.1.0-rc.1')).toBe(1)
    expect(cmp('0.1.0-rc.10', '0.1.0-rc.9')).toBe(1)
    expect(cmp('0.1.0-alpha', '0.1.0-alpha.1')).toBe(-1)
    expect(cmp('0.1.0-alpha.1', '0.1.0-alpha')).toBe(1)
    expect(cmp('0.1.0-1', '0.1.0-alpha')).toBe(-1)
    expect(cmp('0.1.0-alpha', '0.1.0-1')).toBe(1)
    expect(cmp('0.1.0-alpha', '0.1.0-beta')).toBe(-1)
    expect(cmp('0.1.0-beta', '0.1.0-alpha')).toBe(1)
    expect(cmp('0.1.0-rc.1', '0.1.0-rc.1')).toBe(0)
    expect(cmp('0.1.0+a', '0.1.0+b')).toBe(0)
  })
})

describe('resolveInstanceSupport', () => {
  it('is supported at or above the floor, unsupported below, unknown without a version', () => {
    expect(resolveInstanceSupport('0.1.0')).toEqual({
      status: 'supported',
      version: '0.1.0',
      minVersion: MIN_SUPPORTED_INSTANCE_VERSION,
    })
    expect(resolveInstanceSupport(' 0.4.2 ').version).toBe('0.4.2')
    expect(resolveInstanceSupport('0.1.0-rc.1').status).toBe('unsupported')
    expect(resolveInstanceSupport('0.0.9').status).toBe('unsupported')
    expect(resolveInstanceSupport(undefined)).toEqual({
      status: 'unknown',
      version: null,
      minVersion: MIN_SUPPORTED_INSTANCE_VERSION,
    })
    expect(resolveInstanceSupport(null).status).toBe('unknown')
    expect(resolveInstanceSupport('trunk').status).toBe('unknown')
    expect(resolveInstanceSupport('0.0.1', '0.0.1').status).toBe('supported')
    expect(resolveInstanceSupport('0.1.0', 'nope').status).toBe('unknown')
  })

  it('names both numbers and the fix in the refusal', () => {
    expect(instanceUnsupportedMessage(resolveInstanceSupport('0.0.9'))).toBe(
      'That control plane runs TurboPanel 0.0.9; this app needs 0.1.0 or newer. Update the instance, then connect again.',
    )
    expect(instanceUnsupportedMessage(resolveInstanceSupport(undefined))).toContain(
      'TurboPanel unknown;',
    )
  })
})

describe('client version', () => {
  it('is unset until the app sets it, and then rides the request header', () => {
    expect(getClientVersion()).toBeNull()
    expect(clientVersionHeaders()).toEqual({})
    setClientVersion(' 0.1.0 ')
    expect(getClientVersion()).toBe('0.1.0')
    expect(clientVersionHeaders()).toEqual({ [CLIENT_VERSION_HEADER]: '0.1.0' })
    setClientVersion('')
    expect(clientVersionHeaders()).toEqual({})
    setClientVersion(undefined)
    expect(getClientVersion()).toBeNull()
  })
})

describe('instance version', () => {
  it('records the response header and clears it when a response carries none', () => {
    expect(getInstanceVersion()).toBeNull()
    expect(recordInstanceVersion(new Headers({ [INSTANCE_VERSION_HEADER]: '0.1.0' }))).toBe(
      '0.1.0',
    )
    expect(getInstanceVersion()).toBe('0.1.0')
    expect(recordInstanceVersion(new Headers())).toBeNull()
    expect(getInstanceVersion()).toBeNull()
    expect(recordInstanceVersion(new Headers({ [INSTANCE_VERSION_HEADER]: '  ' }))).toBeNull()
  })
})
