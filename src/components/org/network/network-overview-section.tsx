import { useRouter, type Href } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  networkAddressesHref,
  networkDockerHref,
  networkFabricHref,
  serversDatacentersHref,
} from '@/lib/org-navigation'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
import { spacing, webPointer } from '@/lib/theme'

type NetworkHubLink = {
  title: string
  hint: string
  href: string
}

function hubLinks(orgId: string): NetworkHubLink[] {
  return [
    {
      title: 'Datacenters',
      hint: 'A datacenter is a routing domain of one or more private subnets. Create from a server IP — the prefix is detected.',
      href: serversDatacentersHref(orgId),
    },
    {
      title: TURBOFABRIC_PRODUCT_NAME,
      hint: 'Opt-in mesh for environments that run across servers.',
      href: networkFabricHref(orgId),
    },
    {
      title: 'Addresses',
      hint: 'Public and datacenter address pool for ingress and internal routing.',
      href: networkAddressesHref(orgId),
    },
    {
      title: 'Docker networks',
      hint: 'Compose external Docker network registry.',
      href: networkDockerHref(orgId),
    },
  ]
}

export function NetworkOverviewSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const router = useRouter()

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Network</Text>
      <Text style={panelStyles.pageCopy}>
        Private subnets live on Datacenters. This area is the mesh, address pool,
        and Docker registry.
      </Text>

      <SectionPanel title="Areas" hint="One job each">
        <View style={styles.list}>
          {hubLinks(orgId).map((link) => (
            <Pressable
              key={link.href}
              style={[panelStyles.detailCard, webPointer]}
              onPress={() => router.push(link.href as Href)}
              accessibilityRole="link"
              accessibilityLabel={link.title}
            >
              <Text style={panelStyles.detailTitle}>{link.title}</Text>
              <Text style={panelStyles.muted}>{link.hint}</Text>
            </Pressable>
          ))}
        </View>
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  list: {
    gap: spacing.sm,
  },
})
