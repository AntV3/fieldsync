/**
 * Auth types: the app's user profile, active company, and Supabase session.
 */

import type { Session, User as SupabaseAuthUser } from '@supabase/supabase-js'
import type { UserRow, CompanyRow, UserCompanyRow } from './database'

/** The Supabase auth session (JWT + auth user) */
export type AuthSession = Session

/** The raw Supabase auth user (id/email from the auth schema) */
export type AuthProviderUser = SupabaseAuthUser

/** The application user profile row (public.users) */
export type AuthUser = UserRow

/** The company the user is currently acting under */
export type AuthCompany = CompanyRow

/** Consolidated auth state as managed by useAuthState */
export interface AuthState {
  user: AuthUser | null
  company: AuthCompany | null
  userCompanies: UserCompanyRow[]
  session?: AuthSession | null
}
