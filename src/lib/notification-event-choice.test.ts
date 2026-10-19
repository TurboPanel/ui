import { describe, expect, it } from 'vitest'
import { notificationEventChoiceLabel } from '@/lib/notification-event-choice'

describe('notificationEventChoiceLabel', () => {
  it('shows the plain name and then the code', () => {
    expect(
      notificationEventChoiceLabel({
        event: 'folder.orphans_found',
        label: 'A folder was left behind on a server',
        example: 'A folder was left behind on a server',
      })
    ).toBe('A folder was left behind on a server · folder.orphans_found')
    expect(
      notificationEventChoiceLabel({
        event: 'certificate.renewal_failed',
        label: 'A certificate failed to renew',
        example: 'Certificate renewal failed for a domain',
      })
    ).toBe('A certificate failed to renew · certificate.renewal_failed')
  })

  it('falls back to the sample sentence for a control plane that sends no label', () => {
    expect(
      notificationEventChoiceLabel({ event: 'server.offline', example: 'Server unknown went offline' })
    ).toBe('Server unknown went offline · server.offline')
    expect(
      notificationEventChoiceLabel({
        event: 'server.offline',
        label: '   ',
        example: 'Server unknown went offline',
      })
    ).toBe('Server unknown went offline · server.offline')
  })
})
