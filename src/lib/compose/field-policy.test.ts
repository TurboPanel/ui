import { describe, expect, it } from 'vitest'
import {
  classifyDeployKey,
  classifyDeployPlacementKey,
  classifyNetworkKey,
  classifyServiceKey,
  classifyTopLevelKey,
  DEPLOY_FIELD_KEYS,
  NETWORK_FIELD_KEYS,
  SPANNING_NETWORK_DRIVER,
  unsupportedDeployReason,
  unsupportedNetworkReason,
} from './field-policy'
import { blockingComposeLintIssues, lintComposeYaml } from './lint'
import { FIELD_POLICY_FIXTURES } from './field-policy.fixtures'

describe('field policy registry', () => {
  it('gives every unsupported field a reason the diagnostic can quote', () => {
    for (const key of DEPLOY_FIELD_KEYS) {
      if (classifyDeployKey(key)?.state !== 'unsupported') continue
      // A bare "unsupported" tells an author nothing they can act on.
      expect(unsupportedDeployReason(key)?.length ?? 0).toBeGreaterThan(20)
    }
  })

  it('mirrors the instance verdict for each deploy key', () => {
    expect(classifyDeployKey('mode')?.state).toBe('interpreted')
    expect(classifyDeployKey('replicas')?.state).toBe('interpreted')
    expect(classifyDeployKey('placement')?.state).toBe('interpreted')
    expect(classifyDeployKey('resources')?.state).toBe('passthrough')
    expect(classifyDeployKey('restart_policy')?.state).toBe('interpreted')
    expect(classifyDeployKey('labels')?.state).toBe('interpreted')
    expect(classifyDeployKey('update_config')?.state).toBe('unsupported')
    expect(classifyDeployKey('rollback_config')?.state).toBe('unsupported')
    expect(classifyDeployKey('endpoint_mode')?.state).toBe('unsupported')
  })

  it('leaves placement sub-keys to the scheduler work', () => {
    expect(classifyDeployPlacementKey('max_replicas_per_node')?.state).toBe(
      'interpreted',
    )
    expect(classifyDeployPlacementKey('server_id')?.state).toBe(
      'runtime-generated',
    )
  })

  it('treats driver: overlay as the authored spanning signal', () => {
    expect(SPANNING_NETWORK_DRIVER).toBe('overlay')
    expect(classifyNetworkKey('driver')?.state).toBe('interpreted')
    expect(classifyNetworkKey('driver', 'overlay')?.state).toBe('interpreted')
    expect(classifyNetworkKey('nope')).toBeUndefined()
  })

  it('leaves a non-overlay network entirely to Docker', () => {
    for (const key of ['attachable', 'ipam', 'driver_opts', 'enable_ipv6', 'internal']) {
      expect(classifyNetworkKey(key)?.state).toBe('passthrough')
      expect(classifyNetworkKey(key, 'bridge')?.state).toBe('passthrough')
      expect(unsupportedNetworkReason(key, 'bridge')).toBeUndefined()
    }
  })

  it('mirrors the instance verdict for each overlay-only network key', () => {
    for (const key of ['attachable', 'ipam', 'driver_opts', 'enable_ipv6', 'internal']) {
      expect(classifyNetworkKey(key, 'overlay')?.state).toBe('unsupported')
      // A bare "unsupported" tells an author nothing they can act on.
      expect(unsupportedNetworkReason(key, 'overlay')?.length ?? 0).toBeGreaterThan(20)
    }
    // external/name still name the operator's own registered Docker network.
    expect(classifyNetworkKey('external', 'overlay')?.state).toBe('passthrough')
    expect(classifyNetworkKey('name', 'overlay')?.state).toBe('passthrough')
    expect(classifyNetworkKey('labels', 'overlay')?.state).toBe('passthrough')
  })

  it('answers for every network key it knows at both drivers', () => {
    for (const key of NETWORK_FIELD_KEYS) {
      expect(classifyNetworkKey(key)?.state).toBeTypeOf('string')
      expect(classifyNetworkKey(key, 'overlay')?.state).toBeTypeOf('string')
    }
  })

  it('answers for top-level and service keys', () => {
    expect(classifyTopLevelKey('services')?.state).toBe('passthrough')
    expect(classifyTopLevelKey('version')?.state).toBe('interpreted')
    expect(classifyTopLevelKey('nope')).toBeUndefined()
    // Real Compose keys this platform does not implement stay unknown rather
    // than becoming accepted no-ops.
    expect(classifyTopLevelKey('include')).toBeUndefined()
    expect(classifyServiceKey('image')?.state).toBe('passthrough')
    expect(classifyServiceKey('deploy')?.state).toBe('interpreted')
    expect(classifyServiceKey('imaage')).toBeUndefined()
  })
})

describe('shared field-policy fixtures', () => {
  // The editor has no deploy-time mode, so only the permissive column is
  // asserted here; the instance suite runs the strict one over the same file.
  for (const fixture of FIELD_POLICY_FIXTURES) {
    it(fixture.description, () => {
      const issues = lintComposeYaml(fixture.compose)
      const blocking = blockingComposeLintIssues(issues)
      for (const expected of fixture.expectedIssues) {
        const found = issues.find((issue) => issue.path === expected.path)
        expect(found?.level, `level for ${expected.path}`).toBe(expected.level)
        expect(found?.message, `message for ${expected.path}`).toContain(
          expected.messageIncludes,
        )
        expect(
          blocking.some((issue) => issue.path === expected.path),
          `blocking for ${expected.path}`,
        ).toBe(expected.blocking)
      }
      // Nothing beyond what the fixture declares — an extra diagnostic is drift
      // between the two linters just as surely as a missing one.
      expect(issues.map((issue) => issue.path).sort()).toEqual(
        fixture.expectedIssues.map((issue) => issue.path).sort(),
      )
    })
  }
})
