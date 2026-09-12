import { describe, expect, it } from 'vitest'
import { DOCKER_ADDRESS_POOLS_MAX } from '@/lib/instance-api'
import {
  dockerNetworkAddressingLines,
  isValidDefaultBridgeCidr,
  parseDockerAddressPoolDrafts,
  parseDockerNetworkAddressingDraft,
} from './docker-addressing'

describe('parseDockerAddressPoolDrafts', () => {
  it('normalizes bases, parses sizes, and skips fully blank rows', () => {
    const result = parseDockerAddressPoolDrafts([
      { base: '10.200.5.7/16', size: '24' },
      { base: '', size: '' },
      { base: 'fd00:200::/48', size: '64' },
    ])
    expect(result).toEqual({
      ok: true,
      pools: [
        { base: '10.200.0.0/16', size: 24 },
        { base: 'fd00:200::/48', size: 64 },
      ],
    })
  })

  it('rejects an invalid base on the right row', () => {
    const result = parseDockerAddressPoolDrafts([
      { base: '10.200.0.0/16', size: '24' },
      { base: 'not-a-cidr', size: '24' },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.index).toBe(1)
      expect(result.error.field).toBe('base')
    }
  })

  it('bounds size between the base prefix and /30 (IPv4) or /126 (IPv6)', () => {
    const tooSmall = parseDockerAddressPoolDrafts([{ base: '10.200.0.0/16', size: '8' }])
    expect(tooSmall.ok).toBe(false)
    if (!tooSmall.ok) {
      expect(tooSmall.error.field).toBe('size')
      expect(tooSmall.error.message).toContain('/16')
      expect(tooSmall.error.message).toContain('/30')
    }
    expect(parseDockerAddressPoolDrafts([{ base: '10.200.0.0/16', size: '31' }]).ok).toBe(false)
    expect(parseDockerAddressPoolDrafts([{ base: '10.200.0.0/16', size: '30' }]).ok).toBe(true)
    expect(parseDockerAddressPoolDrafts([{ base: 'fd00::/48', size: '127' }]).ok).toBe(false)
    expect(parseDockerAddressPoolDrafts([{ base: 'fd00::/48', size: '126' }]).ok).toBe(true)
    expect(parseDockerAddressPoolDrafts([{ base: '10.200.0.0/16', size: 'x' }]).ok).toBe(false)
    expect(parseDockerAddressPoolDrafts([{ base: '10.200.0.0/16', size: '' }]).ok).toBe(false)
  })

  it('rejects pools that overlap each other', () => {
    const result = parseDockerAddressPoolDrafts([
      { base: '10.200.0.0/16', size: '24' },
      { base: '10.200.4.0/24', size: '26' },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.index).toBe(1)
      expect(result.error.field).toBe('overlap')
    }
    // Different families never overlap.
    expect(
      parseDockerAddressPoolDrafts([
        { base: '10.200.0.0/16', size: '24' },
        { base: 'fd00::/48', size: '64' },
      ]).ok,
    ).toBe(true)
  })

  it('caps the number of pools', () => {
    const drafts = Array.from({ length: DOCKER_ADDRESS_POOLS_MAX + 1 }, (_, i) => ({
      base: `10.${i + 1}.0.0/16`,
      size: '24',
    }))
    const result = parseDockerAddressPoolDrafts(drafts)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.index).toBe(DOCKER_ADDRESS_POOLS_MAX)
      expect(result.error.message).toContain(String(DOCKER_ADDRESS_POOLS_MAX))
    }
    expect(parseDockerAddressPoolDrafts(drafts.slice(0, DOCKER_ADDRESS_POOLS_MAX)).ok).toBe(true)
  })
})

describe('isValidDefaultBridgeCidr', () => {
  it('accepts a host address with prefix and refuses the network address', () => {
    expect(isValidDefaultBridgeCidr('172.17.0.1/16')).toBe(true)
    expect(isValidDefaultBridgeCidr(' 172.17.0.1/16 ')).toBe(true)
    expect(isValidDefaultBridgeCidr('172.17.0.0/16')).toBe(false)
    expect(isValidDefaultBridgeCidr('fd00:17::1/64')).toBe(true)
    expect(isValidDefaultBridgeCidr('fd00:17::/64')).toBe(false)
    expect(isValidDefaultBridgeCidr('FD00:17::/64')).toBe(false)
  })

  it('allows /31 and /32, which have no distinct network address', () => {
    expect(isValidDefaultBridgeCidr('10.0.0.0/31')).toBe(true)
    expect(isValidDefaultBridgeCidr('10.0.0.0/32')).toBe(true)
    expect(isValidDefaultBridgeCidr('fd00::/128')).toBe(true)
  })

  it('refuses bare addresses and garbage', () => {
    expect(isValidDefaultBridgeCidr('172.17.0.1')).toBe(false)
    expect(isValidDefaultBridgeCidr('/16')).toBe(false)
    expect(isValidDefaultBridgeCidr('bridge')).toBe(false)
    expect(isValidDefaultBridgeCidr('')).toBe(false)
  })
})

describe('parseDockerNetworkAddressingDraft', () => {
  const blank = { subnet: '', ipRange: '', gateway: '', mtu: '' }

  it('treats blank fields as absent', () => {
    expect(parseDockerNetworkAddressingDraft(blank)).toEqual({ ok: true, addressing: {} })
  })

  it('normalizes a full set', () => {
    expect(
      parseDockerNetworkAddressingDraft({
        subnet: '10.201.0.9/24',
        ipRange: '10.201.0.128/25',
        gateway: '10.201.0.1',
        mtu: '1420',
      }),
    ).toEqual({
      ok: true,
      addressing: {
        subnet: '10.201.0.0/24',
        ipRange: '10.201.0.128/25',
        gateway: '10.201.0.1',
        mtu: 1420,
      },
    })
  })

  it('requires a subnet before ipRange or gateway', () => {
    const noSubnetRange = parseDockerNetworkAddressingDraft({ ...blank, ipRange: '10.0.0.0/25' })
    expect(noSubnetRange.ok).toBe(false)
    if (!noSubnetRange.ok) expect(noSubnetRange.field).toBe('ipRange')
    const noSubnetGateway = parseDockerNetworkAddressingDraft({ ...blank, gateway: '10.0.0.1' })
    expect(noSubnetGateway.ok).toBe(false)
    if (!noSubnetGateway.ok) expect(noSubnetGateway.field).toBe('gateway')
  })

  it('keeps ipRange and gateway inside the subnet, gateway without prefix', () => {
    const outsideRange = parseDockerNetworkAddressingDraft({
      ...blank,
      subnet: '10.201.0.0/24',
      ipRange: '10.202.0.0/25',
    })
    expect(outsideRange.ok).toBe(false)
    if (!outsideRange.ok) expect(outsideRange.field).toBe('ipRange')
    const widerRange = parseDockerNetworkAddressingDraft({
      ...blank,
      subnet: '10.201.0.0/24',
      ipRange: '10.201.0.0/16',
    })
    expect(widerRange.ok).toBe(false)
    const outsideGateway = parseDockerNetworkAddressingDraft({
      ...blank,
      subnet: '10.201.0.0/24',
      gateway: '10.201.1.1',
    })
    expect(outsideGateway.ok).toBe(false)
    if (!outsideGateway.ok) expect(outsideGateway.field).toBe('gateway')
    const prefixedGateway = parseDockerNetworkAddressingDraft({
      ...blank,
      subnet: '10.201.0.0/24',
      gateway: '10.201.0.1/24',
    })
    expect(prefixedGateway.ok).toBe(false)
  })

  it('rejects an invalid subnet and an out-of-range MTU', () => {
    const badSubnet = parseDockerNetworkAddressingDraft({ ...blank, subnet: '10.201.0.0' })
    expect(badSubnet.ok).toBe(false)
    if (!badSubnet.ok) expect(badSubnet.field).toBe('subnet')
    for (const mtu of ['1279', '9001', '1500.5', 'jumbo']) {
      const bad = parseDockerNetworkAddressingDraft({ ...blank, mtu })
      expect(bad.ok).toBe(false)
      if (!bad.ok) expect(bad.field).toBe('mtu')
    }
    expect(parseDockerNetworkAddressingDraft({ ...blank, mtu: '1280' }).ok).toBe(true)
    expect(parseDockerNetworkAddressingDraft({ ...blank, mtu: '9000' }).ok).toBe(true)
  })
})

describe('dockerNetworkAddressingLines', () => {
  it('lists only the addressing keys that are present', () => {
    expect(dockerNetworkAddressingLines(null)).toEqual([])
    expect(dockerNetworkAddressingLines({ dockerNetworkName: 'shared' })).toEqual([])
    expect(
      dockerNetworkAddressingLines({
        dockerNetworkName: 'shared',
        subnet: '10.201.0.0/24',
        gateway: ' 10.201.0.1 ',
        mtu: 1420,
        ipRange: '',
      }),
    ).toEqual([
      { label: 'Subnet', value: '10.201.0.0/24' },
      { label: 'Gateway', value: '10.201.0.1' },
      { label: 'MTU', value: '1420' },
    ])
  })
})
