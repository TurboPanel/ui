import { Platform, type TextInputProps } from 'react-native'

type AutoComplete = NonNullable<TextInputProps['autoComplete']>

/**
 * Autofill for a box that holds a secret the person pastes or makes up (an API
 * token, an SMTP password, a webhook secret): never the saved sign-in. Browsers
 * ignore "off" on a password box but do not fill a saved sign-in into one
 * marked "new-password". On a phone "off" keeps the keyboard from offering one.
 */
export function secretAutoComplete(os: string = Platform.OS): AutoComplete {
  return os === 'web' ? 'new-password' : 'off'
}

/**
 * A plain box next to a secret one (a label or a name). A browser takes the
 * text box before a password box for the user name of a sign-in, so without
 * this it fills the saved email there.
 */
export const NO_AUTOFILL: AutoComplete = 'off'
