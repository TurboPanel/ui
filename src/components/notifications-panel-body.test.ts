import { describe, expect, it, vi } from 'vitest'
import type { NotificationRecord } from '@/lib/instance-api'

// The component module imports native UI and routing packages the node test
// runner cannot load; `notificationHref` is a pure function, so only those
// imports are replaced.
vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  View: 'View',
  Platform: { OS: 'web', select: (spec: Record<string, unknown>) => spec.web ?? spec.default },
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/header-menu-group-styles', () => ({ headerMenuGroupStyles: {} }))
vi.mock('@/components/ui', () => ({ StatusDot: 'StatusDot' }))
vi.mock('@/lib/theme', () => ({
  colors: new Proxy({}, { get: () => '#000' }),
  spacing: new Proxy({}, { get: () => 0 }),
  webPointer: {},
}))
vi.mock('@/lib/queries/notifications', () => ({
  useDismissNotification: vi.fn(),
  useMarkNotificationsRead: vi.fn(),
  useNotificationsQuery: vi.fn(),
}))

const { notificationHref } = await import('@/components/notifications-panel-body')

function row(patch: Partial<NotificationRecord>): NotificationRecord {
  return {
    id: 'n-1',
    event: 'server.offline',
    severity: 'critical',
    title: 'Server db-1 went offline',
    body: null,
    organizationId: 'org-1',
    targetType: 'server',
    targetId: 'srv-1',
    readAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...patch,
  } as NotificationRecord
}

describe('the bell inbox: where a row leads', () => {
  it('a row that names a server opens that server in its organization', () => {
    expect(notificationHref(row({}))).toBe('/org-1/servers/srv-1')
  })

  it('an organization row without a server opens the organization overview', () => {
    expect(notificationHref(row({ targetType: null, targetId: null }))).toBe('/org-1/overview')
  })

  it('an instance-wide row has nowhere to go', () => {
    expect(
      notificationHref(row({ organizationId: null, targetType: null, targetId: null }))
    ).toBeNull()
  })
})
