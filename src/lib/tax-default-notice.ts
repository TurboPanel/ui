import type { AdminTierTaxDefaults, AdminTierTaxDefaultsError } from '@/lib/instance-api'

export type TaxDefaultNoticeContent = {
  tone: 'info' | 'warning'
  title: string
  body: string
}

const UNVERIFIED_PRICES =
  'Until then, prices that do not name their own tax behaviour will not verify; prices that name their own are not affected.'

/** Stripe's status, type and code, for the operator to look up in Stripe's request logs. */
function errorDetail(error: AdminTierTaxDefaultsError | null | undefined): string {
  if (!error) return ''
  const parts = [`status ${error.status}`, error.type]
  if (error.code) parts.push(error.code)
  return ` (${parts.join(', ')})`
}

function setContent(behaviour: string | null): TaxDefaultNoticeContent {
  if (behaviour === 'inclusive' || behaviour === 'exclusive') {
    return {
      tone: 'info',
      title: `Prices are tax ${behaviour} by default`,
      body: 'Set on the payment account, so a price that does not name its own tax behaviour uses this. Those prices verify normally. Change it on the provider, under tax settings.',
    }
  }
  if (behaviour === 'inferred_by_currency') {
    return {
      tone: 'info',
      title: "Prices follow the account's automatic tax setting",
      body: 'Set on the payment account (Automatic): tax is excluded from the price for USD and CAD, so it is added on top, and included for other currencies. Prices that do not name their own tax behaviour use this and verify normally. Change it on the provider, under tax settings.',
    }
  }
  return {
    tone: 'info',
    title: `The account's tax default is ${behaviour ?? 'set'}`,
    body: 'Set on the payment account. Prices that do not name their own tax behaviour use it. Change it on the provider, under tax settings.',
  }
}

function unsetContent(taxDefaults: AdminTierTaxDefaults): TaxDefaultNoticeContent {
  if (taxDefaults.error?.code === 'stripe_tax_inactive') {
    return {
      tone: 'warning',
      title: 'Stripe Tax is not turned on for this account',
      body: `Stripe says Stripe Tax has not been activated, so there is no tax default to read. Turn on Stripe Tax in the Stripe Dashboard under Settings, then Tax, and set a default tax behaviour there, or give each price its own. ${UNVERIFIED_PRICES}`,
    }
  }
  return {
    tone: 'warning',
    title: 'No tax default is set on the Stripe account',
    body: `Stripe answered, and its tax settings name no default tax behaviour. Set one in the Stripe Dashboard under Settings, then Tax, or give each price its own. ${UNVERIFIED_PRICES}`,
  }
}

function permissionContent(taxDefaults: AdminTierTaxDefaults): TaxDefaultNoticeContent {
  const named = taxDefaults.error?.permission
    ? ` Stripe names the missing permission as ${taxDefaults.error.permission}.`
    : ''
  return {
    tone: 'warning',
    title: 'The Stripe key may not read tax settings',
    body: `Stripe refused the request${errorDetail(taxDefaults.error)}, so the panel cannot see the account's tax default, even if one is set.${named} On the Stripe Dashboard's API keys page, edit this restricted key and set its Tax settings permission (listed as Tax Settings and Registrations) to Read, or use a key that has it. ${UNVERIFIED_PRICES}`,
  }
}

/**
 * What to tell the operator about the payment account's tax default.
 * `inferred_by_currency` is the provider's "Automatic": tax excluded for
 * USD and CAD, included for other currencies, and a real default. Each
 * outcome the panel reports gets its own reason and fix; an older panel
 * that sends no outcome only says whether a default was readable.
 */
export function taxDefaultNoticeContent(
  taxDefaults: AdminTierTaxDefaults
): TaxDefaultNoticeContent {
  switch (taxDefaults.outcome) {
    case 'set':
      return setContent(taxDefaults.taxBehavior)
    case 'unset':
      return unsetContent(taxDefaults)
    case 'permission_missing':
      return permissionContent(taxDefaults)
    case 'provider_error':
      return {
        tone: 'warning',
        title: 'Stripe did not answer the tax settings request',
        body: `Stripe returned an error${errorDetail(taxDefaults.error)}, so the account's tax default is unknown. Reload this page to try again. If it keeps failing, find the request in the Stripe Dashboard's request logs. ${UNVERIFIED_PRICES}`,
      }
    case 'not_asked':
      return {
        tone: 'info',
        title: "The account's tax default was not needed",
        body: 'No listed price leaves its tax behaviour to the account default, so the panel did not ask Stripe for it. A price set to "Use default" makes the panel check it.',
      }
    default:
      break
  }
  if (taxDefaults.taxBehavior !== null) return setContent(taxDefaults.taxBehavior)
  return {
    tone: 'warning',
    title: "We could not read the account's tax default",
    body: 'Either the provider did not answer or no default is set. Prices that do not name their own tax behaviour will not verify until a default is set under Stripe tax settings, or each price names its own.',
  }
}
