import { useRouter, type Href } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { CreateOrganizationModal } from '@/components/create-organization-modal'
import { GlassSurface } from '@/components/glass/glass-surface'
import { HeaderCheck } from '@/components/header-check'
import { HeaderChevron } from '@/components/header-chevron'
import {
  HEADER_MENU_WIDTH,
  HEADER_TRIGGER_ICON_SIZE,
  headerMenuGroupStyles,
} from '@/components/header-menu-group-styles'
import { HeaderMenuTrigger } from '@/components/header-menu-trigger'
import { OrganizationIcon } from '@/components/icons/nav-icons'
import { webPointer } from '@/components/org/org-panel-styles'
import type { OrganizationRecord } from '@/lib/instance-api'
import { setActiveOrganizationId } from '@/lib/org-context'
import { defaultOrgDashboardHref } from '@/lib/org-navigation'
import { useCreateOrganization, useOrganizationsQuery } from '@/lib/queries/auth'
import { chrome, colors, layout } from '@/lib/theme'

function organizationLabel(org: OrganizationRecord): string {
  return org.displayName?.trim() || org.id
}

type OrganizationSwitcherSegmentProps = Readonly<{
  orgId: string
}>

export function OrganizationSwitcherSegment({ orgId }: OrganizationSwitcherSegmentProps) {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const isCompact = width < layout.desktopBreakpoint
  const orgsQuery = useOrganizationsQuery()
  const createOrganization = useCreateOrganization()
  const organizations = orgsQuery.data?.organizations ?? []
  const currentOrg = organizations.find((org) => org.id === orgId)
  const canSwitch = organizations.length > 1

  const [menuOpen, setMenuOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const buttonRef = useRef<View>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 56, left: 16 })

  useEffect(() => {
    if (!menuOpen || isCompact) {
      return
    }
    buttonRef.current?.measureInWindow((x, y, w, h) => {
      setMenuPosition({
        top: y + h + 6,
        left: Math.max(12, x + w - HEADER_MENU_WIDTH),
      })
    })
  }, [menuOpen, isCompact])

  const closeMenu = () => setMenuOpen(false)

  let label = orgId
  if (currentOrg) {
    label = organizationLabel(currentOrg)
  } else if (orgsQuery.isLoading) {
    label = 'Loading…'
  }

  const switchTo = (nextOrgId: string) => {
    if (nextOrgId === orgId) {
      closeMenu()
      return
    }
    setActiveOrganizationId(nextOrgId)
    closeMenu()
    router.replace(defaultOrgDashboardHref(nextOrgId) as Href)
  }

  const openCreate = () => {
    closeMenu()
    setCreateOpen(true)
  }

  const handleCreate = async (displayName: string) => {
    const result = await createOrganization.run({ displayName })
    if (!result.ok) {
      return { ok: false, error: result.error ?? 'Could not create organization.' }
    }
    const nextOrgId = result.value?.id
    if (!nextOrgId) {
      return { ok: false, error: 'Could not create organization.' }
    }
    setActiveOrganizationId(nextOrgId)
    router.replace(defaultOrgDashboardHref(nextOrgId) as Href)
    return { ok: true }
  }

  const menuBody = (
    <GlassSurface
      style={[headerMenuGroupStyles.menu, isCompact && headerMenuGroupStyles.menuSheet]}
      intensity="strong"
    >
      {canSwitch ? (
        <>
          <Text style={headerMenuGroupStyles.menuHeading}>Organizations</Text>
          {organizations.map((org) => {
            const active = org.id === orgId
            const name = organizationLabel(org)
            return (
              <Pressable
                key={org.id}
                style={({ pressed }) => [
                  headerMenuGroupStyles.menuItem,
                  active && headerMenuGroupStyles.menuItemActive,
                  pressed && headerMenuGroupStyles.itemPressed,
                  webPointer,
                ]}
                onPress={() => switchTo(org.id)}
                accessibilityRole="menuitem"
                accessibilityLabel={`Switch to ${name}`}
                accessibilityState={{ selected: active }}
              >
                <View style={headerMenuGroupStyles.menuItemMark}>
                  {active ? <HeaderCheck color={chrome.accent} /> : null}
                </View>
                <Text
                  style={[
                    headerMenuGroupStyles.menuItemLabel,
                    active && headerMenuGroupStyles.menuItemLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {name}
                </Text>
              </Pressable>
            )
          })}
          <View style={headerMenuGroupStyles.menuDivider} />
        </>
      ) : null}

      <Pressable
        style={({ pressed }) => [
          headerMenuGroupStyles.menuAction,
          pressed && headerMenuGroupStyles.itemPressed,
          webPointer,
        ]}
        onPress={openCreate}
        accessibilityRole="menuitem"
        accessibilityLabel="Create new organization"
      >
        <Text style={headerMenuGroupStyles.menuActionLabel}>
          Create organization
        </Text>
      </Pressable>
    </GlassSurface>
  )

  return (
    <>
      <View ref={buttonRef} collapsable={false} style={styles.triggerWrap}>
        <HeaderMenuTrigger
          open={menuOpen}
          onPress={() => setMenuOpen((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel={`Organization: ${label}`}
          accessibilityState={{ expanded: menuOpen }}
        >
          <View style={headerMenuGroupStyles.triggerGlyph}>
            <OrganizationIcon size={HEADER_TRIGGER_ICON_SIZE} color={colors.textDim} />
          </View>
          <View style={headerMenuGroupStyles.triggerCopy}>
            <Text style={headerMenuGroupStyles.triggerLabel} numberOfLines={1}>
              {label}
            </Text>
          </View>
          <HeaderChevron
            color={menuOpen ? colors.text : colors.textDim}
            open={menuOpen}
          />
        </HeaderMenuTrigger>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType={isCompact ? 'slide' : 'fade'}
        onRequestClose={closeMenu}
      >
        <View
          style={[
            headerMenuGroupStyles.backdrop,
            isCompact && headerMenuGroupStyles.backdropCompact,
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeMenu}
            accessibilityRole="button"
            accessibilityLabel="Close organization menu"
          />
          {isCompact ? (
            <View style={headerMenuGroupStyles.sheetWrap}>{menuBody}</View>
          ) : (
            <View
              style={[
                headerMenuGroupStyles.desktopMenuWrap,
                {
                  top: menuPosition.top,
                  left: menuPosition.left,
                  width: HEADER_MENU_WIDTH,
                },
              ]}
            >
              {menuBody}
            </View>
          )}
        </View>
      </Modal>

      <CreateOrganizationModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
    </>
  )
}

const styles = StyleSheet.create({
  triggerWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
})
