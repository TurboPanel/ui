// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EnvironmentGitSourcePanel } from './environment-git-source-panel'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const REPO = '11111111-2222-4333-8444-555555555555'

const state = vi.hoisted(() => ({
  repositories: [] as unknown[],
  persist: vi.fn(() => Promise.resolve({ ok: true })),
  updateRepository: vi.fn(() => Promise.resolve({ ok: true })),
}))

vi.mock('react-native', () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: Props) => <div>{children}</div>,
  Text: ({ children }: Props) => <span>{children}</span>,
}))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/lib/theme', () => ({ colors: {}, spacing: { sm: 8 } }))
vi.mock('@/components/ui/v4/section', () => ({
  Section: ({ title, children }: Props) => (
    <section aria-label={title as string}>{children}</section>
  ),
}))
vi.mock('@/components/ui', () => ({
  Button: ({ label, accessibilityLabel, onPress, disabled }: Props) => (
    <button
      type="button"
      aria-label={(accessibilityLabel ?? label) as string}
      disabled={disabled as boolean}
      onClick={onPress as () => void}
    >
      {label as string}
    </button>
  ),
  ButtonRow: ({ children }: Props) => <div>{children}</div>,
  SettingRow: ({ label, children }: Props) => (
    <div>
      {label as string}
      {children}
    </div>
  ),
  TextField: ({ label }: Props) => <input aria-label={label as string} readOnly />,
  Toggle: ({ value, accessibilityLabel, onValueChange }: Props) => (
    <button
      type="button"
      role="switch"
      aria-checked={value as boolean}
      aria-label={accessibilityLabel as string}
      onClick={() => (onValueChange as (next: boolean) => void)(!(value as boolean))}
    />
  ),
}))
vi.mock('@/components/org/compose-persistence', () => ({
  usePersistEnvironmentCompose: () => ({ run: state.persist, actionError: null }),
}))
vi.mock('@/lib/queries/releases', () => ({
  useRepositories: () => ({ data: { repositories: state.repositories } }),
  useUpdateRepository: () => ({
    run: state.updateRepository,
    isPending: false,
    actionError: null,
  }),
}))

function compose(source: Record<string, unknown>) {
  return {
    version: 1,
    data: {
      services: {
        web: { 'x-turbopanel': { serviceKind: 'node', source: { sourceId: REPO, ...source } } },
      },
    },
    presentation: { keyOrder: ['services'], comments: {} },
  }
}

function renderPanel(source: Record<string, unknown> = { branch: 'live' }) {
  render(
    <EnvironmentGitSourcePanel
      orgId="o"
      environmentId="e1"
      environmentName="production"
      projectCompose={compose(source)}
      environmentCompose={null}
      canEdit
    />
  )
}

beforeEach(() => {
  state.persist.mockClear()
  state.updateRepository.mockClear()
})
afterEach(cleanup)

describe('EnvironmentGitSourcePanel', () => {
  it('says in one sentence that pushes are off because the repository is, and turns it on', () => {
    state.repositories = [
      { id: REPO, repositoryUrl: 'https://github.com/acme/site', autoDeploy: 'disabled' },
    ]
    renderPanel()
    expect(
      screen.getByText('Pushes to live deploy production: off (repository auto-deploy is off)')
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: "Turn on the repository's auto-deploy" }))
    expect(state.updateRepository).toHaveBeenCalledWith({
      repositoryId: REPO,
      patch: { autoDeploy: 'immediate' },
    })
    // The environment's own switch stays, so pushes can still be turned off here.
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
  })

  it("turns on the environment's own switch when only that is off", () => {
    state.repositories = [
      { id: REPO, repositoryUrl: 'https://github.com/acme/site', autoDeploy: 'immediate' },
    ]
    renderPanel({ branch: 'live', deployOnPush: false })
    expect(
      screen.getByText('Pushes to live deploy production: off (repository auto-deploy is on)')
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }))
    expect(state.persist).toHaveBeenCalledTimes(1)
    expect(state.updateRepository).not.toHaveBeenCalled()
  })

  it('offers no Turn on when pushes already deploy', () => {
    state.repositories = [
      { id: REPO, repositoryUrl: 'https://github.com/acme/site', autoDeploy: 'immediate' },
    ]
    renderPanel()
    expect(
      screen.getByText('Pushes to live deploy production: on (repository auto-deploy is on)')
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Turn on/ })).toBeNull()
  })
})
