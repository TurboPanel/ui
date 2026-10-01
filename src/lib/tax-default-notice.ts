export type TaxDefaultNoticeContent = {
  tone: 'info' | 'warning'
  title: string
  body: string
}

/**
 * What to tell the operator about the payment account's tax default.
 * `inferred_by_currency` is the provider's "Automatic": tax excluded for
 * USD and CAD, included for other currencies. `null` means the provider
 * did not answer or no default is set.
 */
export function taxDefaultNoticeContent(behaviour: string | null): TaxDefaultNoticeContent {
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
    tone: 'warning',
    title: "We could not read the account's tax default",
    body: 'Either the provider did not answer or no default is set. Prices that do not name their own tax behaviour will not verify until a default is set under Stripe tax settings, or each price names its own.',
  }
}
