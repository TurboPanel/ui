// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SuperadminOnly } from '@/components/admin/access/superadmin-only'

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }))

vi.mock('@/lib/auth-context', () => ({
  useAuth,
  isSuperadminSession: (session: { role?: string } | null) => session?.role === 'superadmin',
}))

// The real components are React Native; only their text matters here.
vi.mock('@/components/ui', () => ({
  SectionPanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  InlineNotice: ({ title, body }: { title: string; body: string }) => (
    <p>
      {title} {body}
    </p>
  ),
}))

describe('SuperadminOnly', () => {
  afterEach(cleanup)

  it('shows the controls to a superadmin', () => {
    useAuth.mockReturnValue({ session: { role: 'superadmin' } })
    render(
      <SuperadminOnly title="Hostnames">
        <span>the editor</span>
      </SuperadminOnly>
    )
    expect(screen.getByText('the editor')).toBeTruthy()
  })

  it('shows a note instead of the controls to another admin', () => {
    useAuth.mockReturnValue({ session: { role: 'admin' } })
    render(
      <SuperadminOnly title="Hostnames">
        <span>the editor</span>
      </SuperadminOnly>
    )
    expect(screen.queryByText('the editor')).toBeNull()
    expect(screen.getByText(/Superadmin only/)).toBeTruthy()
  })
})
