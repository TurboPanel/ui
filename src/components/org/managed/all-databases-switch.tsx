import { useState } from 'react'
import { Text, View } from 'react-native'

import { Button, ButtonRow, SettingRow, Toggle } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'

export const ALL_DATABASES_OFF_CONFIRM =
  'Logins that use All Databases go back to the databases picked for them at the next apply.'

/** The Allow All Databases Logins switch; turning it off asks first. */
export function AllDatabasesSwitch({
  value,
  onChange,
  disabled,
  busy = false,
  hint,
}: Readonly<{
  value: boolean
  onChange: (next: boolean) => void
  disabled: boolean
  busy?: boolean
  hint: string
}>) {
  const [confirming, setConfirming] = useState(false)
  return (
    <View>
      <SettingRow label="Allow All Databases Logins" description={hint}>
        <Toggle
          value={value}
          disabled={disabled}
          busy={busy}
          accessibilityLabel="Allow All Databases Logins"
          onValueChange={(next) => {
            if (next) {
              setConfirming(false)
              onChange(true)
            } else {
              setConfirming(true)
            }
          }}
        />
      </SettingRow>
      {confirming ? (
        <View>
          <Text style={panelStyles.calloutWarning}>{ALL_DATABASES_OFF_CONFIRM}</Text>
          <ButtonRow>
            <Button
              label="Turn Off"
              variant="danger"
              size="sm"
              onPress={() => {
                setConfirming(false)
                onChange(false)
              }}
            />
            <Button label="Cancel" size="sm" onPress={() => setConfirming(false)} />
          </ButtonRow>
        </View>
      ) : null}
    </View>
  )
}
