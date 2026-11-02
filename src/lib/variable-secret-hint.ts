/**
 * Whether a plain (non-secret) environment variable looks like it holds a
 * secret, going by its name or the shape of its value. Advice only: nothing is
 * blocked, and a variable marked Secret is never checked.
 */
const SECRET_NAME = /(SECRET|PASSWORD|PASSWD|TOKEN|PRIVATE_KEY|API_?KEY|ACCESS_KEY|CREDENTIAL)/i

const SECRET_VALUE_SHAPES: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /^[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i,
  /^eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+$/,
  /^(ghp|gho|ghs|github_pat)_\w{20,}$/,
  /^AKIA[0-9A-Z]{16}$/,
  /^(sk|rk)_(live|test)_[A-Za-z0-9]{16,}$/,
]

export const SECRET_LOOKING_VARIABLE_HINT =
  'This looks like a secret. Mark it as Secret so the value is stored sealed and never shown again.'

export function looksLikeSecretVariable(key: string, value: string): boolean {
  if (SECRET_NAME.test(key) && value.trim() !== '') return true
  const trimmed = value.trim()
  return SECRET_VALUE_SHAPES.some((shape) => shape.test(trimmed))
}
