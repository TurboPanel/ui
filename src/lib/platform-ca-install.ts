/** Steps shown before a phone connects to a Platform-CA `:8443` origin. */
export const ANDROID_PLATFORM_CA_INSTALL_STEPS = [
  'Copy the Platform CA onto the phone. On the control plane host, open Admin → Access → Platform CA and download the PEM.',
  'On the phone, open Settings → Security → Encryption & credentials → Install a certificate → CA certificate, then choose that file.',
  'Connect to https://<LAN host>:8443. This app trusts the system certificate store and certificates you install.',
] as const

export const IOS_PLATFORM_CA_INSTALL_NOTE =
  'Install the Platform CA, then enable it under Settings → General → About → Certificate Trust Settings. Connect to https://<LAN host>:8443.'

const BROWSER_PLATFORM_CA_INSTALL_NOTE =
  'Trust the Platform CA in this browser, then connect to https://<LAN host>:8443.'

/** Platform-specific instructions for installing the self-hosted Platform CA. */
export function platformCaInstallSteps(os: string): readonly string[] {
  if (os === 'android') return ANDROID_PLATFORM_CA_INSTALL_STEPS
  if (os === 'ios') return [IOS_PLATFORM_CA_INSTALL_NOTE]
  return [BROWSER_PLATFORM_CA_INSTALL_NOTE]
}
