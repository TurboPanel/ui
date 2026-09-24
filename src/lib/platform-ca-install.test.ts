import { describe, expect, it } from 'vitest'
import {
  ANDROID_PLATFORM_CA_INSTALL_STEPS,
  platformCaInstallSteps,
} from '@/lib/platform-ca-install'

describe('platformCaInstallSteps', () => {
  it('tells Android how to install the Platform CA before connecting on :8443', () => {
    const steps = platformCaInstallSteps('android')
    expect(steps).toEqual(ANDROID_PLATFORM_CA_INSTALL_STEPS)
    expect(steps.join('\n')).toContain('Platform CA')
    expect(steps.join('\n')).toContain('Encryption & credentials')
    expect(steps.join('\n')).toContain('https://<LAN host>:8443')
    expect(steps.join('\n')).toContain('system certificate store')
  })

  it('gives iOS and browser install notes for the same listener', () => {
    expect(platformCaInstallSteps('ios').join('\n')).toContain(
      'Certificate Trust Settings',
    )
    expect(platformCaInstallSteps('web').join('\n')).toContain(
      'https://<LAN host>:8443',
    )
  })
})