import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SetupTypeChoiceCard } from '@/components/org/project-create/setup-type-icons'
import {
  MAIN_SETUP_CHOICES,
  MORE_SETUP_CHOICES,
  setupOptionForChoice,
  type SetupChoice,
} from '@/components/org/project-create/setup-types'
import { Button, TextLink } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { PageTitle, SectionHeading } from '@/components/ui/v4'
import { spacing } from '@/lib/theme'

/** One width for the whole screen, so nothing jumps as sections open. */
export const NEW_PROJECT_COLUMN_MAX_WIDTH = 640

const MORE_WAYS_LABEL = 'More ways to start: upload files over SFTP, a template, or service forms'

/**
 * The new-project screen: name and workspace at the top, three main ways to
 * start, the other three under "More ways to start", then whatever the picked
 * card needs (repository, branch and lane; or a template or database pick)
 * inline below it. Cancel sits on the left of the footer and the primary
 * action on the right.
 */
export function NewProjectScreen({
  basics,
  notice,
  error,
  selectedChoice,
  moreOpen,
  onToggleMore,
  onSelectChoice,
  detail,
  footerHidden = false,
  primaryLabel,
  primaryDisabled,
  busy,
  onPrimary,
  onCancel,
}: Readonly<{
  /** Name, workspace and description fields. */
  basics: ReactNode
  /** A notice above the fields, e.g. the System workspace refusal. */
  notice?: ReactNode
  error?: string | null
  selectedChoice: SetupChoice | null
  moreOpen: boolean
  onToggleMore: () => void
  onSelectChoice: (choice: SetupChoice) => void
  /** What the picked card asks for, shown under the cards. */
  detail?: ReactNode
  /** The repository picker's clone-URL lane ends in its own buttons. */
  footerHidden?: boolean
  primaryLabel: string
  primaryDisabled: boolean
  busy: boolean
  onPrimary: () => void
  onCancel: () => void
}>) {
  // A card picked from "More ways to start" stays visible even when the list is closed.
  const moreShown = moreOpen
    ? MORE_SETUP_CHOICES
    : MORE_SETUP_CHOICES.filter((choice) => choice === selectedChoice)
  return (
    <View style={styles.column}>
      <PageTitle
        title="New Project"
        sub="Pick where it comes from. You can change everything later."
      />
      {notice}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}

      <View style={styles.section}>{basics}</View>

      <View style={styles.section}>
        <SectionHeading title="Start from" />
        <View style={styles.cards} accessibilityRole="radiogroup" accessibilityLabel="Start from">
          {MAIN_SETUP_CHOICES.map((choice) => (
            <SetupCard
              key={choice}
              choice={choice}
              selected={selectedChoice === choice}
              onSelect={onSelectChoice}
            />
          ))}
        </View>
        <TextLink
          label={MORE_WAYS_LABEL}
          numberOfLines={2}
          expanded={moreOpen}
          onPress={onToggleMore}
        />
        {moreShown.length > 0 ? (
          <View style={styles.cards}>
            {moreShown.map((choice) => (
              <SetupCard
                key={choice}
                choice={choice}
                selected={selectedChoice === choice}
                onSelect={onSelectChoice}
              />
            ))}
          </View>
        ) : null}
      </View>

      {detail ? <View style={styles.section}>{detail}</View> : null}

      {footerHidden ? null : (
        <View style={styles.footer}>
          <Button
            label="Cancel"
            variant="secondary"
            disabled={busy}
            onPress={onCancel}
            accessibilityLabel="Cancel"
          />
          <Button
            label={primaryLabel}
            busyLabel="Creating…"
            variant="primary"
            busy={busy}
            disabled={primaryDisabled}
            onPress={onPrimary}
            accessibilityLabel={primaryLabel}
          />
        </View>
      )}
    </View>
  )
}

function SetupCard({
  choice,
  selected,
  onSelect,
}: Readonly<{
  choice: SetupChoice
  selected: boolean
  onSelect: (choice: SetupChoice) => void
}>) {
  const option = setupOptionForChoice(choice)
  if (!option) return null
  return (
    <SetupTypeChoiceCard
      option={option}
      selected={selected}
      onPress={() => {
        onSelect(choice)
      }}
    />
  )
}

const styles = StyleSheet.create({
  // No ScrollView: `OrgScreenScroll` already scrolls every org screen.
  column: {
    width: '100%',
    maxWidth: NEW_PROJECT_COLUMN_MAX_WIDTH,
    alignSelf: 'flex-start',
    gap: spacing.lg,
  },
  section: { gap: spacing.md },
  cards: { gap: spacing.sm },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
})
