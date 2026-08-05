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
import {
  HEADER_MENU_WIDTH,
  headerMenuGroupStyles,
} from '@/components/header-menu-group-styles'
import { webPointer } from '@/components/org/org-panel-styles'
import type { OrganizationRecord } from '@/lib/instance-api'
import { setActiveOrganizationId } from '@/lib/org-context'
import { defaultOrgDashboardHref } from '@/lib/org-navigation'
import { useCreateOrganization, useOrganizationsQuery } from '@/lib/queries/auth'
import { layout } from '@/lib/theme'

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
    <View style={[headerMenuGroupStyles.menu, isCompact && headerMenuGroupStyles.menuSheet]}>
      {canSwitch ? (
        <>
          <Text style={headerMenuGroupStyles.menuHeading}>Switch organization</Text>
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
          headerMenuGroupStyles.menuActionPrimary,
          pressed && headerMenuGroupStyles.itemPressed,
          webPointer,
        ]}
        onPress={openCreate}
        accessibilityRole="menuitem"
        accessibilityLabel="Create new organization"
      >
        <Text style={headerMenuGroupStyles.menuActionPrimaryLabel}>
          Create new organization
        </Text>
      </Pressable>
    </View>
  )

  const chevron = (
    <Text
      style={[
        headerMenuGroupStyles.segmentChevron,
        menuOpen && headerMenuGroupStyles.segmentChevronOpen,
      ]}
    >
      ▾
    </Text>
  )

  return (
    <>
      <View
        ref={buttonRef}
        collapsable={false}
        style={[headerMenuGroupStyles.segment, headerMenuGroupStyles.orgSegment]}
      >
        {canSwitch ? (
          <Pressable
            style={({ pressed }) => [
              headerMenuGroupStyles.segmentMain,
              styles.segmentFill,
              menuOpen && headerMenuGroupStyles.segmentOpen,
              pressed && headerMenuGroupStyles.itemPressed,
              webPointer,
            ]}
            onPress={() => setMenuOpen((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={`Organization: ${label}`}
            accessibilityState={{ expanded: menuOpen }}
          >
            <Text style={headerMenuGroupStyles.segmentLabel} numberOfLines={1}>
              {label}
            </Text>
            {chevron}
          </Pressable>
        ) : (
          <>
            <View style={headerMenuGroupStyles.segmentMainStatic}>
              <Text style={headerMenuGroupStyles.segmentLabel} numberOfLines={1}>
                {label}
              </Text>
            </View>
            <View style={headerMenuGroupStyles.segmentSplitDivider} />
            <Pressable
              style={({ pressed }) => [
                headerMenuGroupStyles.segmentChevronButton,
                menuOpen && headerMenuGroupStyles.segmentOpen,
                pressed && headerMenuGroupStyles.itemPressed,
                webPointer,
              ]}
              onPress={() => setMenuOpen((current) => !current)}
              accessibilityRole="button"
              accessibilityLabel={`Organization menu for ${label}`}
              accessibilityState={{ expanded: menuOpen }}
            >
              {chevron}
            </Pressable>
          </>
        )}
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType={isCompact ? 'slide' : 'fade'}
        onRequestClose={closeMenu}
      >
        <View style={headerMenuGroupStyles.backdrop}>
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
  segmentFill: {
    flex: 1,
  },
})
