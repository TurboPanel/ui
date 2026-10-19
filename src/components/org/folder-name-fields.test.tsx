// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_FOLDER_DRAFT } from '@/lib/directory-names'
import { FolderNameFields } from './folder-name-fields'

const state = vi.hoisted(() => ({ mode: 'slug' as 'slug' | 'uuid' | 'both' }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: { muted: {}, error: {} } }))
vi.mock('@/lib/query-client', () => ({ useCan: () => true }))
vi.mock('@/lib/queries/folders', () => ({ useDirectoryNamesMode: () => state.mode }))
vi.mock('@/components/ui', () => ({
  FormField: ({ label, children }: { label: string; children?: unknown }) => (
    <div>
      <span>{label}</span>
      {children as never}
    </div>
  ),
  SegmentedControl: ({ onChange }: { onChange: (v: string) => void }) => (
    <button onClick={() => onChange('uuid')}>pick id</button>
  ),
  TextField: ({
    label,
    value,
    onChangeText,
    error,
    placeholder,
  }: {
    label: string
    value: string
    onChangeText: (v: string) => void
    error?: string | null
    placeholder?: string
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChangeText(e.target.value)}
      />
      {error ? <span>{error}</span> : null}
    </label>
  ),
  Toggle: ({
    onValueChange,
    accessibilityLabel,
  }: {
    onValueChange: () => void
    accessibilityLabel: string
  }) => <button aria-label={accessibilityLabel} onClick={onValueChange} />,
}))

beforeEach(() => {
  state.mode = 'slug'
})
afterEach(() => cleanup())

const mount = (onChange = vi.fn(), draft = EMPTY_FOLDER_DRAFT, nameHint = 'My Uploads') => {
  render(
    <FolderNameFields
      orgId="o"
      noun="volume"
      nameHint={nameHint}
      draft={draft}
      onChange={onChange}
    />
  )
  return onChange
}

describe('FolderNameFields', () => {
  it('offers a name box that shows the name that will be picked', () => {
    mount()
    expect((screen.getByLabelText('Folder name') as HTMLInputElement).placeholder).toBe('my-uploads')
    expect(screen.getByText(/Leave empty to use “my-uploads”/)).toBeTruthy()
  })

  it('reports a typed name and a bad one', () => {
    const onChange = mount()
    fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'data' } })
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FOLDER_DRAFT, name: 'data' })
    cleanup()
    mount(vi.fn(), { ...EMPTY_FOLDER_DRAFT, name: 'Bad Name' })
    expect(screen.getAllByText(/Lowercase letters/).length).toBeGreaterThan(1)
  })

  it('has no name box when the organization names folders by id', () => {
    state.mode = 'uuid'
    mount()
    expect(screen.queryByLabelText('Folder name')).toBeNull()
    expect(screen.getByText(/names folders by id/)).toBeTruthy()
  })

  it('lets each item pick when the organization allows both', () => {
    state.mode = 'both'
    const onChange = mount()
    fireEvent.click(screen.getByText('pick id'))
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FOLDER_DRAFT, kind: 'uuid' })
  })

  it('explains the shared switch and that it is final', () => {
    const onChange = mount()
    expect(screen.getByText(/goes in a folder named after its environment/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Share this volume across environments'))
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FOLDER_DRAFT, common: true })
    cleanup()
    mount(vi.fn(), { ...EMPTY_FOLDER_DRAFT, common: true })
    expect(screen.getByText(/shared folder, so it does not depend/)).toBeTruthy()
  })
})
