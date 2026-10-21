// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackupPolicyRecord } from '@/lib/instance-api'
import { ManagedBackupSchedulesPanel } from './managed-backup-schedules-panel'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const h = vi.hoisted(() => ({
  policies: [] as unknown[],
  databases: ['appdb', 'reports'],
  create: vi.fn(),
  update: vi.fn(),
}))

vi.mock('react-native', () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  Text: ({ children }: Props) => <span>{children}</span>,
  View: ({ children }: Props) => <div>{children}</div>,
}))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/lib/theme', () => ({
  colors: new Proxy({}, { get: () => '#000' }),
  spacing: new Proxy({}, { get: () => 0 }),
}))
vi.mock('@/components/org/server-timezone-picker', () => ({ ServerTimezonePicker: () => null }))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: Props) => <span>{label as string}</span>,
  Button: ({ label, onPress, disabled }: Props) => (
    <button type="button" disabled={disabled as boolean} onClick={onPress as () => void}>
      {label as string}
    </button>
  ),
  ButtonRow: ({ children }: Props) => <div>{children}</div>,
  Checkbox: () => null,
  ConfirmButton: ({ label }: Props) => <button type="button">{label as string}</button>,
  EmptyState: ({ title }: Props) => <p>{title as string}</p>,
  FormField: ({ label, error, children }: Props) => (
    <div>
      <span>{label as string}</span>
      {error ? <span role="alert">{error as string}</span> : null}
      {children}
    </div>
  ),
  InlineNotice: ({ title }: Props) => <p>{title as string}</p>,
  LoadingState: () => null,
  SectionPanel: ({ children }: Props) => <div>{children}</div>,
  SegmentedControl: () => null,
  Select: ({ value, options, noneLabel, accessibilityLabel, onChange }: Props) => (
    <select
      aria-label={accessibilityLabel as string}
      value={(value as string | null) ?? ''}
      onChange={(e) => (onChange as (v: string | null) => void)(e.target.value || null)}
    >
      <option value="">{noneLabel as string}</option>
      {(options as { value: string; label: string }[]).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
  TextField: ({ label, value, onChangeText }: Props) => (
    <input
      aria-label={label as string}
      value={value as string}
      onChange={(e) => (onChangeText as (v: string) => void)(e.target.value)}
    />
  ),
  Toggle: () => null,
}))
vi.mock('@/lib/queries/managed', () => ({
  useManagedDatabases: () => ({ data: { databases: h.databases } }),
}))
vi.mock('@/lib/queries/servers', () => ({ useTimezones: () => ({ data: { timezones: [] } }) }))
vi.mock('@/lib/queries/backup-policies', () => ({
  useBackupPolicies: () => ({ data: { policies: h.policies }, isLoading: false, error: null }),
  useBackupRuns: () => ({ data: { runs: [] }, isLoading: false, error: null }),
  useCreateBackupPolicy: () => ({ mutateAsync: h.create, isPending: false }),
  useUpdateBackupPolicy: () => ({ mutateAsync: h.update, isPending: false }),
  useDeleteBackupPolicy: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function policy(overrides: Partial<BackupPolicyRecord> = {}): BackupPolicyRecord {
  return {
    id: 'pol-1',
    name: 'Daily',
    targetKind: 'managed',
    managedId: 'env-1',
    schedule: '0 3 * * *',
    preset: { preset: 'daily', time: '03:00' },
    timezone: null,
    retentionKeep: 7,
    enabled: true,
    automatic: false,
    nextRunAt: null,
    lastRun: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderPanel() {
  render(<ManagedBackupSchedulesPanel orgId="org-1" environmentId="env-1" canManage supported />)
}

beforeEach(() => {
  h.policies = []
  h.create.mockReset().mockResolvedValue({ reconcile: null })
  h.update.mockReset().mockResolvedValue({ reconcile: null })
})
afterEach(cleanup)

describe('backup schedule database choice', () => {
  it('defaults to the main database and leaves the field out of the request', async () => {
    renderPanel()
    fireEvent.click(screen.getByText('Add schedule'))
    const select = screen.getByLabelText('Database to back up') as HTMLSelectElement
    expect(select.value).toBe('')
    expect(screen.getByText('The main database (default)')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Nightly' } })
    fireEvent.click(screen.getByText('Add schedule'))
    await waitFor(() => expect(h.create).toHaveBeenCalled())
    expect(h.create.mock.calls[0]![0]).not.toHaveProperty('database')
  })

  it('sends the chosen database on create', async () => {
    renderPanel()
    fireEvent.click(screen.getByText('Add schedule'))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Nightly' } })
    fireEvent.change(screen.getByLabelText('Database to back up'), { target: { value: 'reports' } })
    fireEvent.click(screen.getByText('Add schedule'))
    await waitFor(() => expect(h.create).toHaveBeenCalled())
    expect(h.create.mock.calls[0]![0]).toMatchObject({ database: 'reports' })
  })

  it('shows the chosen database in the list and clears it with an explicit null', async () => {
    h.policies = [policy({ database: 'appdb' })]
    renderPanel()
    expect(screen.getByText('Database: appdb')).toBeTruthy()
    fireEvent.click(screen.getByText('Edit'))
    fireEvent.change(screen.getByLabelText('Database to back up'), { target: { value: '' } })
    fireEvent.click(screen.getByText('Save schedule'))
    await waitFor(() => expect(h.update).toHaveBeenCalled())
    expect(h.update.mock.calls[0]![0].body).toMatchObject({ database: null })
  })

  it('names the main database for a schedule without a choice, and stays quiet on an older panel', () => {
    h.policies = [policy({ database: null })]
    renderPanel()
    expect(screen.getByText('Database: The main database (default)')).toBeTruthy()
    cleanup()
    h.policies = [policy()]
    renderPanel()
    expect(screen.queryByText(/^Database:/)).toBeNull()
  })

  it('explains a refused database in plain words', async () => {
    h.update.mockRejectedValue(new Error('PATCH failed: HTTP 422: backup_database_invalid'))
    h.policies = [policy({ database: 'appdb' })]
    renderPanel()
    fireEvent.click(screen.getByText('Edit'))
    fireEvent.click(screen.getByText('Save schedule'))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/isn't on this server/)
    )
    expect(screen.queryByText(/backup_database_invalid/)).toBeNull()
  })
})
