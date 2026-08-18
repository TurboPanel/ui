import { createContext, useContext, type ReactNode } from 'react'

const OrgTabPagerOwnershipContext = createContext(false)

/**
 * True when the native tab pager is covering the three overview routes.
 * Those route screens render `null` so they are not mounted twice.
 */
export function OrgTabPagerOwnershipProvider({
  active,
  children,
}: Readonly<{
  active: boolean
  children: ReactNode
}>) {
  return (
    <OrgTabPagerOwnershipContext.Provider value={active}>
      {children}
    </OrgTabPagerOwnershipContext.Provider>
  )
}

export function useOrgTabPagerOwnership(): boolean {
  return useContext(OrgTabPagerOwnershipContext)
}
