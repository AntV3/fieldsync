import { createContext, useContext } from 'react'
import { ALL_PERMISSIONS } from './permissions'

// Without a provider nothing is restricted, so components render the same
// in isolation (tests, the field app) as they did before permissions existed.
const PermissionsContext = createContext(ALL_PERMISSIONS)

export const PermissionsProvider = PermissionsContext.Provider

// eslint-disable-next-line react-refresh/only-export-components
export function usePermissions() {
  return useContext(PermissionsContext)
}
