import { useState } from 'react'
import { View } from 'react-native'
import { EnvironmentMap } from '@/components/org/project/environment-overview/environment-map'
import {
  Legend,
  OptionSwitch,
  type SwitchOption,
} from '@/components/org/project/environment-overview/map-section'
import { SectionHeading } from '@/components/ui/v4/section-heading'
import type { EnvironmentConfigViewResponse, ProjectPrincipalRecord } from '@/lib/instance-api'
import { mapLayout } from '@/lib/v4/map-layout'
import { baseMapInput, type BaseEnvironment } from '@/lib/v4/project-base'

const NONE = 'none'

/** Nothing opens from a Base station: the Base is not running anywhere. */
const NO_LINK = () => null

/**
 * The Base map, with "Compare with" none or one environment: the comparison
 * marks what that environment adds, changes or removes. Environments whose
 * configuration could not be read are not offered.
 */
export function BaseMapSection({
  view,
  environments,
  principals,
}: Readonly<{
  view: EnvironmentConfigViewResponse
  environments: readonly BaseEnvironment[]
  principals: readonly ProjectPrincipalRecord[] | undefined
}>) {
  const [compareId, setCompareId] = useState(NONE)
  const readable = environments.filter((environment) => environment.view !== undefined)
  const chosen = readable.find((environment) => environment.id === compareId)
  const compareView = chosen?.view
  const compare = chosen && compareView ? { name: chosen.name, view: compareView } : null
  const layout = mapLayout(baseMapInput({ view, principals, compare }))
  const options: readonly SwitchOption<string>[] = [
    { value: NONE, label: 'None' },
    ...readable.map((environment) => ({ value: environment.id, label: environment.name })),
  ]
  return (
    <View>
      <SectionHeading
        title="Base map"
        note="Compare with"
        action={
          readable.length > 0 ? (
            <OptionSwitch
              label="Compare the Base with"
              options={options}
              value={chosen ? chosen.id : NONE}
              onChange={setCompareId}
            />
          ) : null
        }
      />
      <EnvironmentMap layout={layout} hrefFor={NO_LINK} legend={<Legend layout={layout} />} />
    </View>
  )
}
