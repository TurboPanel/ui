import { Platform, type TextInputProps } from 'react-native'

type MaskedProps = Pick<TextInputProps, 'multiline' | 'secureTextEntry' | 'style'>

/** True when the browser can hide the characters of a plain multi-line box with CSS. */
export function browserCanMaskText(): boolean {
  // `CSS` is a browser global, not in React Native's types.
  const css = (globalThis as { CSS?: { supports?: (name: string, value: string) => boolean } }).CSS
  return css?.supports?.('-webkit-text-security', 'disc') === true
}

/**
 * Props for a value box that may hold a secret and may span lines (a pasted
 * key). React Native Web drops `type="password"` for a multi-line box, so on
 * the web a secret there would show in clear. The browser hides the
 * characters with `-webkit-text-security` when it can; otherwise the box goes
 * single-line and secure, which keeps it hidden at the cost of line breaks.
 */
export function maskedMultilineProps(
  secret: boolean,
  os: string = Platform.OS,
  canMask: boolean = browserCanMaskText()
): MaskedProps {
  if (!secret) return { multiline: true }
  if (os !== 'web') return { multiline: true, secureTextEntry: true }
  if (canMask) {
    // Not in React Native's style types; React Native Web passes it through.
    return { multiline: true, style: { WebkitTextSecurity: 'disc' } as object }
  }
  return { multiline: false, secureTextEntry: true }
}
