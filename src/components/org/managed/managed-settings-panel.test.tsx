// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { describeManagedImage } from '@/lib/managed-releases'
import { managedCatalogEntryForCode } from '@/lib/managed-services'
import { buildManagedSettingsPayload, settingsToForm } from './managed-settings-panel'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({}))
vi.mock('@/lib/query-client', () => ({ useCan: () => true }))
vi.mock('@/lib/queries/managed', () => ({ useSaveServerManagedExternalAccess: () => ({}) }))

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
