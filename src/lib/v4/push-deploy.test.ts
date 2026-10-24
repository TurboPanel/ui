import { describe, expect, it } from 'vitest'
import { pushDeployLine } from '@/lib/v4/push-deploy'

const base = { environment: 'production', branch: 'live', deployOnPush: true } as const

describe('pushDeployLine', () => {
  it('is on only when both switches are on', () => {
    expect(pushDeployLine({ ...base, autoDeploy: 'immediate' })).toEqual({
      text: 'Pushes to live deploy production: on (repository auto-deploy is on)',
      on: true,
      turnOn: null,
    })
    expect(pushDeployLine({ ...base, autoDeploy: 'checks_passed' }).text).toBe(
      'Pushes to live deploy production: on (repository auto-deploy is on after checks pass)'
    )
  })

  it('says off and turns on the repository first when its auto-deploy is off', () => {
    expect(pushDeployLine({ ...base, autoDeploy: 'disabled' })).toEqual({
      text: 'Pushes to live deploy production: off (repository auto-deploy is off)',
      on: false,
      turnOn: 'repository',
    })
    expect(pushDeployLine({ ...base, deployOnPush: false, autoDeploy: 'disabled' }).turnOn).toBe(
      'repository'
    )
  })

  it("turns on the environment's switch when only that is off", () => {
    expect(pushDeployLine({ ...base, deployOnPush: false, autoDeploy: 'immediate' })).toEqual({
      text: 'Pushes to live deploy production: off (repository auto-deploy is on)',
      on: false,
      turnOn: 'environment',
    })
  })

  it('leaves the repository out when it is not known, and names a missing branch', () => {
    expect(pushDeployLine({ ...base, autoDeploy: null }).text).toBe(
      'Pushes to live deploy production: on'
    )
    expect(pushDeployLine({ ...base, branch: null, autoDeploy: 'immediate' })).toEqual({
      text: 'No branch is set for production, so a push deploys nothing',
      on: false,
      turnOn: null,
    })
  })
})
