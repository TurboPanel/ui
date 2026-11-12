// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewProjectScreen } from './new-project-screen'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/org/project-create/setup-type-icons', () => ({
  SetupTypeChoiceCard: ({
    option,
    selected,
    onPress,
  }: {
    option: { label: string }
    selected: boolean
    onPress: () => void
  }) => (
    <button aria-pressed={selected} onClick={onPress}>
      {option.label}
    </button>
  ),
}))
vi.mock('@/components/ui', () => ({
  Button: ({
    label,
    onPress,
    disabled,
  }: {
    label: string
    onPress: () => void
    disabled?: boolean
  }) => (
    <button data-role="footer" disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
  TextLink: ({
    label,
    onPress,
    expanded,
  }: {
    label: string
    onPress: () => void
    expanded?: boolean
  }) => (
    <button aria-expanded={expanded} onClick={onPress}>
      {label}
    </button>
  ),
}))
vi.mock('@/components/ui/v4', () => ({
  PageTitle: ({ title, sub }: { title: string; sub?: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{sub}</p>
    </header>
  ),
  SectionHeading: ({ title }: { title: string }) => <h2>{title}</h2>,
}))

afterEach(cleanup)

type Props = ComponentProps<typeof NewProjectScreen>

function renderScreen(overrides: Partial<Props> = {}) {
  const props: Props = {
    basics: <input aria-label="Project name" />,
    selectedChoice: null,
    moreOpen: false,
    onToggleMore: vi.fn(),
    onSelectChoice: vi.fn(),
    primaryLabel: 'Continue',
    primaryDisabled: true,
    busy: false,
    onPrimary: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
  render(<NewProjectScreen {...props} />)
  return props
}

const MORE_LABEL = 'More ways to start: upload files over SFTP, a template, or service forms'

describe('NewProjectScreen', () => {
  it('puts the name at the top and three main ways to start under it', () => {
    renderScreen()
    expect(screen.getByRole('heading', { name: 'New Project' })).toBeTruthy()
    expect(screen.getByLabelText('Project name')).toBeTruthy()
    for (const label of ['From a Git repository', 'Compose', 'Managed database']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    expect(screen.queryByRole('button', { name: 'Hosting upload' })).toBeNull()
  })

  it('keeps the other three one press away under More ways to start', () => {
    const props = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: MORE_LABEL }))
    expect(props.onToggleMore).toHaveBeenCalledTimes(1)
    cleanup()
    renderScreen({ moreOpen: true })
    for (const label of ['Hosting upload', 'Template', 'Service forms']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: MORE_LABEL }).getAttribute('aria-expanded')).toBe(
      'true'
    )
  })

  it('keeps a picked card from the closed list on screen', () => {
    renderScreen({ selectedChoice: 'template' })
    expect(screen.getByRole('button', { name: 'Template' }).getAttribute('aria-pressed')).toBe(
      'true'
    )
    expect(screen.queryByRole('button', { name: 'Hosting upload' })).toBeNull()
  })

  it('reports the card that was picked', () => {
    const props = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'From a Git repository' }))
    expect(props.onSelectChoice).toHaveBeenCalledWith('repository')
  })

  it('shows the picked card’s detail below the cards', () => {
    renderScreen({ selectedChoice: 'repository', detail: <p>Repository picker</p> })
    expect(screen.getByText('Repository picker')).toBeTruthy()
  })

  it('puts Cancel on the left and the primary action on the right', () => {
    const props = renderScreen({ primaryLabel: 'Create project', primaryDisabled: false })
    const footer = Array.from(document.querySelectorAll('[data-role="footer"]')).map(
      (button) => button.textContent
    )
    expect(footer).toEqual(['Cancel', 'Create project'])
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))
    expect(props.onPrimary).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onCancel).toHaveBeenCalledTimes(1)
  })

  it('hides its footer while the clone-URL lane shows its own buttons', () => {
    renderScreen({ footerHidden: true })
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('shows a create error', () => {
    renderScreen({ error: 'A project with this name already exists.' })
    expect(screen.getByText('A project with this name already exists.')).toBeTruthy()
  })
})
