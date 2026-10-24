import { useEffect, useRef, useState } from 'react'
import {
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { HeaderChevron } from '@/components/header-chevron'
import { useTouch } from '@/components/ui/v4/use-palette'
import { siteUrlFromHostname } from '@/lib/environment-status'
import { chrome, colors, layout, spacing, webPointer } from '@/lib/theme'

const MENU_WIDTH = 300

function openSite(hostname: string): void {
  const url = siteUrlFromHostname(hostname)
  if (!url) return
  Linking.openURL(url).catch(() => {
    // A blocked or unsupported link has nothing to recover; the name stays visible.
  })
}

function HostnameMenu({
  hostnames,
  primary,
  compact,
  anchor,
  onClose,
}: Readonly<{
  hostnames: readonly string[]
  primary: string
  compact: boolean
  anchor: { top: number; left: number }
  onClose: () => void
}>) {
  return (
    <Modal visible transparent animationType={compact ? 'slide' : 'fade'} onRequestClose={onClose}>
      <View style={[styles.backdrop, compact && styles.backdropCompact]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close the hostname list"
        />
        <View
          style={[
            styles.menu,
            compact
              ? styles.menuCompact
              : { position: 'absolute', top: anchor.top, left: anchor.left, width: MENU_WIDTH },
          ]}
          accessibilityLabel="Hostnames"
        >
          {hostnames.map((hostname) => (
            <Pressable
              key={hostname}
              accessibilityRole="link"
              accessibilityLabel={
                hostname === primary ? `Visit ${hostname}, primary hostname` : `Visit ${hostname}`
              }
              style={[styles.menuRow, webPointer]}
              onPress={() => {
                onClose()
                openSite(hostname)
              }}
            >
              <Text style={styles.menuText} numberOfLines={1}>
                {hostname} ↗
              </Text>
              {hostname === primary ? <Text style={styles.menuBadge}>Primary</Text> : null}
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  )
}

/**
 * "Visit <hostname> ↗" in the environment header: opens the primary hostname.
 * With several hostnames it is a split button whose arrow lists them all. On
 * a phone the label shortens to "Visit ↗" and keeps the hostname for screen
 * readers. Renders nothing without a hostname.
 */
export function VisitSiteButton({
  hostnames,
  primary,
}: Readonly<{ hostnames: readonly string[]; primary: string | null }>) {
  const { width } = useWindowDimensions()
  const compact = width < layout.desktopBreakpoint
  const touch = useTouch()
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState({ top: 56, left: 16 })
  const wrapRef = useRef<View | null>(null)

  useEffect(() => {
    if (!open || compact) return
    wrapRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({
        top: y + h + 6,
        left: Math.min(Math.max(12, x + w - MENU_WIDTH), Math.max(12, width - MENU_WIDTH - 12)),
      })
    })
  }, [open, compact, width])

  if (!primary) return null
  const several = hostnames.length > 1
  const sized = [styles.button, touch && styles.touch]

  return (
    <View ref={wrapRef} collapsable={false} style={styles.split}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Visit ${primary}`}
        style={[...sized, several && styles.mainOfSplit, webPointer]}
        onPress={() => openSite(primary)}
        {...({ title: `https://${primary}` } as object)}
      >
        <Text style={styles.text} numberOfLines={1}>
          {compact ? 'Visit ↗' : `Visit ${primary} ↗`}
        </Text>
      </Pressable>
      {several ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Other hostnames"
          accessibilityState={{ expanded: open }}
          style={[...sized, styles.arrowOfSplit, webPointer]}
          onPress={() => setOpen((current) => !current)}
        >
          <HeaderChevron size={12} color={colors.textChip} open={open} />
        </Pressable>
      ) : null}
      {open ? (
        <HostnameMenu
          hostnames={hostnames}
          primary={primary}
          compact={compact}
          anchor={anchor}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  split: { flexDirection: 'row', alignItems: 'stretch', flexShrink: 1, minWidth: 0 },
  button: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  touch: { minHeight: 44 },
  mainOfSplit: { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  arrowOfSplit: {
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderLeftWidth: 0,
    width: 32,
    paddingHorizontal: 0,
    flexShrink: 0,
  },
  text: { color: colors.textChip, fontSize: 12, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  backdropCompact: { justifyContent: 'flex-end' },
  menu: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgPanel,
    padding: spacing.sm,
    gap: 2,
  },
  menuCompact: { margin: spacing.md, marginBottom: spacing.xl },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
  },
  menuText: { flex: 1, color: colors.textBody, fontSize: 14, fontWeight: '600' },
  menuBadge: {
    color: chrome.accent,
    fontSize: 11,
    fontWeight: '700',
  },
})
