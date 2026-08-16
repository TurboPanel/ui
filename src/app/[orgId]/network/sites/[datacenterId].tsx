import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { datacenterHref } from '@/lib/org-navigation'

export default function LegacyNetworkSiteRedirect() {
  const { orgId, datacenterId } = useLocalSearchParams<{
    orgId: string
    datacenterId: string | string[]
  }>()

  const resolvedDatacenterId = Array.isArray(datacenterId)
    ? (datacenterId[0] ?? '')
    : (datacenterId ?? '')

  if (!orgId || !resolvedDatacenterId) {
    return null
  }

  return <Redirect href={datacenterHref(orgId, resolvedDatacenterId) as Href} />
}
