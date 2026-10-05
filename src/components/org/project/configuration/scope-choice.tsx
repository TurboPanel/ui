import { ChoiceCard, ChoiceGroup } from '@/components/ui/v4'
import {
  scopeChoices,
  type ConfigScope,
  type OtherEnvironment,
} from '@/lib/v4/config-edits'

/**
 * "Where does this change go?": this environment only, or the Base for every
 * environment that follows it. Each card names the environments it reaches.
 */
export function ScopeChoice({
  envName,
  others,
  hasOwnChange,
  scope,
  onChange,
}: Readonly<{
  envName: string
  others: readonly OtherEnvironment[]
  hasOwnChange: boolean
  scope: ConfigScope
  onChange: (scope: ConfigScope) => void
}>) {
  return (
    <ChoiceGroup label="Where this change goes">
      {scopeChoices({ envName, others, hasOwnChange }).map((choice) => (
        <ChoiceCard
          key={choice.scope}
          title={choice.title}
          body={choice.body}
          selected={scope === choice.scope}
          onSelect={() => onChange(choice.scope)}
        />
      ))}
    </ChoiceGroup>
  )
}
