// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeManagedImage } from '@/lib/managed-releases'
import { managedCatalogEntryForCode } from '@/lib/managed-services'
import {
  buildManagedSettingsPayload,
  ManagedSettingsPanel,
  settingsToForm,
} from './managed-settings-panel'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) => (
    <button onClick={onPress}>{label}</button>
  ),
  SegmentedControl: () => null,
  TextField: () => null,
}))
vi.mock('@/components/header-chevron', () => ({ HeaderChevron: () => null }))
vi.mock('@/components/org/managed/managed-external-access-switch', () => ({
  ManagedExternalAccessSwitch: () => null,
}))
vi.mock('@/components/org/managed/managed-ssl-mode-picker', () => ({
  ManagedSslModePicker: ({ onSelect }: { onSelect: (mode: string) => void }) => (
    <button onClick={() => onSelect('verify-full')}>pick verify-full</button>
  ),
}))

afterEach(cleanup)
vi.mock('expo-router', () => ({ Link: () => null }))
vi.mock('@/lib/query-client', () => ({ useCan: () => true }))
vi.mock('@/lib/queries/managed', () => ({ useSaveServerManagedExternalAccess: () => ({}) }))
vi.mock('@/lib/queries/servers', () => ({ useServerAddresses: () => ({ data: null }) }))

describe('settings form for an imageless MariaDB service', () => {
  it('shows the legacy 12.3 series and never sends 11.8 on save', async () => {
    const { managedStoredImage } = await import('@/lib/managed-services')
    const catalog = managedCatalogEntryForCode('mariadb')
    expect(catalog?.defaultImage).toBe('docker.io/library/mariadb:11.8')

    const stored = managedStoredImage(catalog, undefined)
    expect(stored).toBe('docker.io/library/mariadb:12.3')
    expect(describeManagedImage(stored)?.series).toBe('12.3')

    const form = settingsToForm({ ssl: {} } as never, stored)
    expect(form.image).toBe('docker.io/library/mariadb:12.3')
    const built = buildManagedSettingsPayload(form)
    expect(built.ok).toBe(true)
    if (built.ok) expect(built.settings.image).toBe('docker.io/library/mariadb:12.3')
  })

  it('keeps an explicit stored image and the current default for other engines', async () => {
    const { managedStoredImage } = await import('@/lib/managed-services')
    const catalog = managedCatalogEntryForCode('mariadb')
    expect(managedStoredImage(catalog, 'docker.io/library/mariadb:11.8')).toBe(
      'docker.io/library/mariadb:11.8',
    )
    const postgres = managedCatalogEntryForCode('postgres')
    expect(managedStoredImage(postgres, undefined)).toBe(postgres?.defaultImage)
  })
})

describe('Hosting part of the settings', () => {
  const renderHosting = () =>
    render(
      <ManagedSettingsPanel
        section="hosting"
        settings={{ ssl: {} } as never}
        engineCode="postgres"
        organizationSslMode={null}
        orgId="o"
        externalAccess={{ servers: [] } as never}
        canManage
        busy={false}
        onApply={vi.fn()}
      />
    )

  it('keeps a waiting client TLS change and its Apply in view with Advanced closed', () => {
    renderHosting()
    expect(screen.queryByText('Save and apply')).toBeNull()
    fireEvent.click(screen.getByLabelText('Show advanced settings'))
    expect(screen.queryByText('Save and apply')).toBeNull()
    fireEvent.click(screen.getByText('pick verify-full'))
    fireEvent.click(screen.getByLabelText('Hide advanced settings'))
    expect(screen.queryByText('pick verify-full')).toBeNull()
    expect(screen.getByText('Save and apply')).toBeTruthy()
  })
})
