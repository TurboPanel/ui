// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, env, SCENARIOS } from '@/components/ui/v4/rn-stub'
import { ProjectScopePicker } from './project-scope-picker'

vi.mock('react-native', async () => {
  const stub = (await import('@/components/ui/v4/rn-stub')).reactNativeStub
  return { ...stub, TextInput: () => null }
})
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }))
vi.mock('@/components/icons/nav-icons', () => ({ SearchIcon: () => null }))
vi.mock('@/components/ui', () => ({
  EmptyState: ({ title }: Readonly<{ title: string }>) => <p>{title}</p>,
  StatusDot: () => null,
}))

const OPTIONS = [
  { environmentId: 'e1', label: 'production', detail: 'Running' },
  { environmentId: 'e2', label: 'staging', detail: '' },
]

beforeEach(() => {
  applyScenario(SCENARIOS[0])
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ProjectScopePicker as the environment title', () => {
  it('names the environment and opens a list led by All environments', () => {
    const onAll = vi.fn()
    const onSelect = vi.fn()
    render(
      <ProjectScopePicker
        variant="title"
        options={OPTIONS}
        activeEnvironmentId="e1"
        onSelect={onSelect}
        allLink={{ label: 'All environments', onPress: onAll }}
      />
    )
    const trigger = screen.getByRole('button', {
      name: 'Environment: production. Change environment',
    })
    expect(trigger.textContent).toBe('production')
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(trigger)
    const links = screen.getAllByRole('link')
    expect(links[0]?.getAttribute('aria-label')).toBe('All environments')
    fireEvent.click(links[0] as HTMLElement)
    expect(onAll).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('switches environment from the list', () => {
    const onSelect = vi.fn()
    env.width = 390
    render(
      <ProjectScopePicker
        variant="title"
        options={OPTIONS}
        activeEnvironmentId="e1"
        onSelect={onSelect}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /^Environment: production/ }))
    expect(screen.queryByRole('link', { name: 'All environments' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'staging' }))
    expect(onSelect).toHaveBeenCalledWith(OPTIONS[1])
  })

  it('keeps the small chip trigger by default', () => {
    render(<ProjectScopePicker options={OPTIONS} activeEnvironmentId={null} onSelect={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: 'Switch to an environment. 2 available' })
    ).toBeTruthy()
  })
})
